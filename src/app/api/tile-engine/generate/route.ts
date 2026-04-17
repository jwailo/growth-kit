import { db } from "@/db";
import {
  gkTileRecords,
  gkTileRuns,
  gkPms,
  gkAgencies,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { renderTile } from "@/lib/tile-engine/renderer";
import { TILE_VARIANTS } from "@/lib/tile-engine/renderer";
import { fileToBase64, urlToBase64 } from "@/lib/tile-engine/assets";
import * as path from "path";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { runId, force } = (await request.json()) as {
    runId: string;
    force?: boolean;
  };

  // Get run
  const [run] = await db
    .select()
    .from(gkTileRuns)
    .where(eq(gkTileRuns.id, runId));

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (force) {
    await db
      .update(gkTileRecords)
      .set({ status: "pending" })
      .where(eq(gkTileRecords.runId, runId));
  }

  // Get records
  const records = await db
    .select()
    .from(gkTileRecords)
    .where(eq(gkTileRecords.runId, runId));

  // Load static assets as base64
  const publicDir = path.join(process.cwd(), "public", "assets");
  const scribbleBase64 = await fileToBase64(
    path.join(publicDir, "scribble.png")
  );
  const logoBase64 = await fileToBase64(path.join(publicDir, "ailo-logo.png"));

  // Parse period into YYYY-MM for storage path
  const periodDate = new Date(run.period + " 1"); // "March 2026 1"
  const yyyy = periodDate.getFullYear();
  const mm = String(periodDate.getMonth() + 1).padStart(2, "0");
  const storagePath = `tiles/${yyyy}-${mm}`;

  let tilesGenerated = 0;

  for (const record of records) {
    // Only process pending or missing_assets records
    if (record.status === "generated") continue;

    try {
      // Get PM and agency data
      const [pm] = await db
        .select()
        .from(gkPms)
        .where(eq(gkPms.id, record.pmId));
      const [agency] = await db
        .select()
        .from(gkAgencies)
        .where(eq(gkAgencies.id, pm.agencyId));

      // Get headshot as base64 (falls back to initials in the template)
      const headshotBase64 = pm.headshotUrl
        ? await urlToBase64(pm.headshotUrl)
        : null;

      const firstName = pm.firstName;
      const lastName = pm.lastName;
      const slug = `${firstName.toLowerCase()}-${lastName.toLowerCase()}`;

      const tileUrls: Record<string, string> = {};
      let uploadFailures = 0;
      const cacheBust = Date.now().toString();

      const displayAgencyName = agency?.displayName ?? agency?.name ?? record.agencyName;

      for (const variant of TILE_VARIANTS) {
        const png = await renderTile({
          agencyName: displayAgencyName,
          firstName,
          lastName,
          responseTime: record.responseTimeMins,
          period: run.period,
          headshotBase64: headshotBase64 || undefined,
          scribbleBase64,
          logoBase64,
          variant: variant.variant,
          showName: variant.showName,
        });

        console.log(`[tile-gen] Rendered ${variant.key} for ${slug}: ${png.length} bytes`);

        const fileName = `${storagePath}/${slug}-${variant.filenameSuffix}-${yyyy}-${mm}.png`;

        const { error: uploadError } = await supabase.storage
          .from("growth-kit-assets")
          .upload(fileName, png, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error(`[tile-gen] Upload FAILED for ${fileName}:`, uploadError.message);
          uploadFailures++;
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("growth-kit-assets").getPublicUrl(fileName);

        const versionedUrl = `${publicUrl}?v=${cacheBust}`;
        console.log(`[tile-gen] Uploaded ${variant.key}: ${versionedUrl}`);
        tileUrls[variant.dbField] = versionedUrl;
      }

      // Only mark as generated if at least one tile was uploaded
      if (Object.keys(tileUrls).length === 0) {
        console.error(`[tile-gen] All uploads failed for ${slug}, marking as error`);
        await db
          .update(gkTileRecords)
          .set({ status: "error" })
          .where(eq(gkTileRecords.id, record.id));
        continue;
      }

      // Update record with tile URLs
      await db
        .update(gkTileRecords)
        .set({
          tileUrlSquare: tileUrls.tileUrlSquare || null,
          tileUrlSquareNamed: tileUrls.tileUrlSquareNamed || null,
          tileUrlIg: tileUrls.tileUrlIg || null,
          tileUrlIgNamed: tileUrls.tileUrlIgNamed || null,
          status: "generated",
        })
        .where(eq(gkTileRecords.id, record.id));

      console.log(`[tile-gen] Record ${slug} complete: ${Object.keys(tileUrls).length}/4 tiles`);
      tilesGenerated++;
    } catch (err) {
      console.error(`Error generating tiles for record ${record.id}:`, err);
      await db
        .update(gkTileRecords)
        .set({ status: "error" })
        .where(eq(gkTileRecords.id, record.id));
    }
  }

  // Update run
  await db
    .update(gkTileRuns)
    .set({
      tilesGenerated,
      status: "complete",
    })
    .where(eq(gkTileRuns.id, runId));

    return NextResponse.json({
      runId,
      tilesGenerated,
      total: records.length,
    });
  } catch (err) {
    console.error("[tile-engine/generate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
