import { db } from "@/db";
import { gkPms } from "@/db/schema/tile-engine";
import { gkHeadshotMatches } from "@/db/schema/headshot-finder";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

const BUCKET = "growth-kit-assets";

export function stagingPath(matchId: string): string {
  return `headshots/staging/${matchId}.jpg`;
}

export function finalPath(pmId: string): string {
  return `headshots/${pmId}.jpg`;
}

export type ApplyStep =
  | "lookup_match"
  | "remove_existing_target"
  | "download_staging"
  | "upload_final"
  | "update_pm"
  | "update_match"
  | "remove_staging";

export type ApplyFailure = {
  ok: false;
  error: string;
  step: ApplyStep;
  details?: Record<string, unknown>;
};

export type ApplySuccess = {
  ok: true;
  headshotUrl: string;
};

export type ApplyResult = ApplySuccess | ApplyFailure;

function fail(
  step: ApplyStep,
  error: string,
  details?: Record<string, unknown>,
): ApplyFailure {
  console.error(
    `[headshot-apply] FAILED step="${step}" error="${error}"`,
    details ?? "",
  );
  return { ok: false, error, step, details };
}

/**
 * Returns the storage client to use for headshot operations.
 * Prefers the service-role admin client (bypasses RLS) when available,
 * falls back to the user-scoped client when SUPABASE_SERVICE_ROLE_KEY
 * is not configured.
 */
function pickStorageClient(userClient: SupabaseClient): {
  client: SupabaseClient;
  scope: "service_role" | "user";
} {
  const admin = getAdminSupabase();
  if (admin) return { client: admin, scope: "service_role" };
  return { client: userClient, scope: "user" };
}

export async function approveMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<ApplyResult> {
  const { client: storageClient, scope } = pickStorageClient(supabase);
  console.log(
    `[headshot-apply] approveMatch matchId=${matchId} storageScope=${scope}`,
  );

  const [match] = await db
    .select()
    .from(gkHeadshotMatches)
    .where(eq(gkHeadshotMatches.id, matchId))
    .limit(1);

  if (!match) {
    return fail("lookup_match", "Match not found", { matchId });
  }
  if (match.status !== "pending_review") {
    return fail("lookup_match", `Match is ${match.status}`, {
      matchId,
      status: match.status,
    });
  }

  const from = stagingPath(matchId);
  const to = finalPath(match.pmId);
  const storage = storageClient.storage.from(BUCKET);

  console.log(
    `[headshot-apply] paths from="${from}" to="${to}" pmId=${match.pmId}`,
  );

  // Best-effort cleanup of any existing target file. Not fatal: upsert below
  // overwrites. We log a warning if remove returns a real error so the
  // operator can see whether DELETE permissions are missing.
  const { error: removeTargetError } = await storage.remove([to]);
  if (removeTargetError && !/not.*found/i.test(removeTargetError.message)) {
    console.warn(
      `[headshot-apply] remove existing target warning (continuing): ${removeTargetError.message}`,
    );
  }

  const { data: download, error: downloadError } = await storage.download(from);
  if (downloadError || !download) {
    return fail(
      "download_staging",
      `Staging download failed: ${downloadError?.message ?? "no body returned"}`,
      {
        from,
        bucket: BUCKET,
        storageScope: scope,
        supabaseError: downloadError ?? null,
      },
    );
  }

  const buffer = Buffer.from(await download.arrayBuffer());
  console.log(
    `[headshot-apply] staging downloaded bytes=${buffer.byteLength} contentType=${download.type || "unknown"}`,
  );

  const { error: uploadError } = await storage.upload(to, buffer, {
    contentType: download.type || "image/jpeg",
    upsert: true,
  });
  if (uploadError) {
    return fail("upload_final", `Upload failed: ${uploadError.message}`, {
      to,
      bucket: BUCKET,
      storageScope: scope,
      supabaseError: uploadError,
    });
  }

  const {
    data: { publicUrl },
  } = storage.getPublicUrl(to);
  const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;
  console.log(`[headshot-apply] uploaded final publicUrl=${publicUrl}`);

  try {
    await db
      .update(gkPms)
      .set({ headshotUrl: cacheBustedUrl, updatedAt: new Date() })
      .where(eq(gkPms.id, match.pmId));
  } catch (err) {
    return fail(
      "update_pm",
      err instanceof Error ? err.message : "Unknown DB error",
      { pmId: match.pmId },
    );
  }

  try {
    await db
      .update(gkHeadshotMatches)
      .set({ status: "applied" })
      .where(eq(gkHeadshotMatches.id, matchId));
  } catch (err) {
    return fail(
      "update_match",
      err instanceof Error ? err.message : "Unknown DB error",
      { matchId },
    );
  }

  // Best-effort cleanup of staging copy. Not fatal.
  const { error: cleanupError } = await storage.remove([from]);
  if (cleanupError && !/not.*found/i.test(cleanupError.message)) {
    console.warn(
      `[headshot-apply] staging cleanup warning: ${cleanupError.message}`,
    );
  }

  console.log(`[headshot-apply] approveMatch OK matchId=${matchId}`);
  return { ok: true, headshotUrl: cacheBustedUrl };
}

export async function rejectMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ ok: true } | ApplyFailure> {
  const { client: storageClient } = pickStorageClient(supabase);

  const [match] = await db
    .select()
    .from(gkHeadshotMatches)
    .where(eq(gkHeadshotMatches.id, matchId))
    .limit(1);

  if (!match) {
    return fail("lookup_match", "Match not found", { matchId });
  }
  if (match.status !== "pending_review") {
    return fail("lookup_match", `Match is ${match.status}`, {
      matchId,
      status: match.status,
    });
  }

  const { error: removeError } = await storageClient.storage
    .from(BUCKET)
    .remove([stagingPath(matchId)]);
  if (removeError && !/not.*found/i.test(removeError.message)) {
    console.warn(
      `[headshot-apply] reject staging cleanup warning: ${removeError.message}`,
    );
  }

  try {
    await db
      .update(gkHeadshotMatches)
      .set({ status: "rejected" })
      .where(eq(gkHeadshotMatches.id, matchId));
  } catch (err) {
    return fail(
      "update_match",
      err instanceof Error ? err.message : "Unknown DB error",
      { matchId },
    );
  }

  return { ok: true };
}
