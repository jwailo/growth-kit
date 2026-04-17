import { db } from "@/db";
import { gkPms } from "@/db/schema/tile-engine";
import { gkHeadshotMatches } from "@/db/schema/headshot-finder";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";

const BUCKET = "growth-kit-assets";

export function stagingPath(matchId: string): string {
  return `headshots/staging/${matchId}.jpg`;
}

export function finalPath(pmId: string): string {
  return `headshots/${pmId}.jpg`;
}

export async function approveMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ ok: true; headshotUrl: string } | { ok: false; error: string }> {
  const [match] = await db
    .select()
    .from(gkHeadshotMatches)
    .where(eq(gkHeadshotMatches.id, matchId))
    .limit(1);

  if (!match) return { ok: false, error: "Match not found" };
  if (match.status !== "pending_review")
    return { ok: false, error: `Match is ${match.status}` };

  const from = stagingPath(matchId);
  const to = finalPath(match.pmId);

  const storage = supabase.storage.from(BUCKET);

  const { error: removeTargetError } = await storage.remove([to]);
  if (removeTargetError && !/not.*found/i.test(removeTargetError.message)) {
    // Non-fatal: log and continue; upload will overwrite with upsert
  }

  const { data: download, error: downloadError } = await storage.download(from);
  if (downloadError || !download) {
    return {
      ok: false,
      error: `Staging download failed: ${downloadError?.message ?? "missing"}`,
    };
  }

  const buffer = Buffer.from(await download.arrayBuffer());
  const { error: uploadError } = await storage.upload(to, buffer, {
    contentType: download.type || "image/jpeg",
    upsert: true,
  });
  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const {
    data: { publicUrl },
  } = storage.getPublicUrl(to);
  const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

  await db
    .update(gkPms)
    .set({ headshotUrl: cacheBustedUrl, updatedAt: new Date() })
    .where(eq(gkPms.id, match.pmId));

  await db
    .update(gkHeadshotMatches)
    .set({ status: "applied" })
    .where(eq(gkHeadshotMatches.id, matchId));

  await storage.remove([from]);

  return { ok: true, headshotUrl: cacheBustedUrl };
}

export async function rejectMatch(
  supabase: SupabaseClient,
  matchId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [match] = await db
    .select()
    .from(gkHeadshotMatches)
    .where(eq(gkHeadshotMatches.id, matchId))
    .limit(1);

  if (!match) return { ok: false, error: "Match not found" };
  if (match.status !== "pending_review")
    return { ok: false, error: `Match is ${match.status}` };

  await supabase.storage.from(BUCKET).remove([stagingPath(matchId)]);

  await db
    .update(gkHeadshotMatches)
    .set({ status: "rejected" })
    .where(eq(gkHeadshotMatches.id, matchId));

  return { ok: true };
}
