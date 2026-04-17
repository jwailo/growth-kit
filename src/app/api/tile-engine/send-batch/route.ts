import { db } from "@/db";
import {
  gkTileRecords,
  gkTileRuns,
  gkPms,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { sendTileEmail } from "@/lib/email/sender";
import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { runId } = await request.json();
    if (!runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 },
      );
    }

    const rows = await db
      .select({
        recordId: gkTileRecords.id,
        responseTimeMins: gkTileRecords.responseTimeMins,
        agencyName: gkTileRecords.agencyName,
        tileUrlSquare: gkTileRecords.tileUrlSquare,
        tileUrlIg: gkTileRecords.tileUrlIg,
        period: gkTileRuns.period,
        pmFirstName: gkPms.firstName,
        pmEmail: gkPms.email,
      })
      .from(gkTileRecords)
      .innerJoin(gkTileRuns, eq(gkTileRecords.runId, gkTileRuns.id))
      .innerJoin(gkPms, eq(gkTileRecords.pmId, gkPms.id))
      .where(
        and(
          eq(gkTileRecords.runId, runId),
          eq(gkTileRecords.status, "generated"),
          isNull(gkTileRecords.sentAt),
        ),
      );

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const failures: Array<{ recordId: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (!row.pmEmail) {
        skipped++;
        continue;
      }

      const tileImageUrl = row.tileUrlSquare ?? row.tileUrlIg;
      if (!tileImageUrl) {
        skipped++;
        continue;
      }

      const result = await sendTileEmail({
        to: row.pmEmail,
        firstName: row.pmFirstName,
        agencyName: row.agencyName,
        responseTimeMins: String(row.responseTimeMins),
        period: row.period,
        tileImageUrl,
      });

      if (result.ok) {
        await db
          .update(gkTileRecords)
          .set({ sentAt: new Date() })
          .where(eq(gkTileRecords.id, row.recordId));
        sent++;
      } else {
        failed++;
        failures.push({
          recordId: row.recordId,
          error: result.error ?? "Unknown error",
        });
      }

      if (i < rows.length - 1) {
        await sleep(1000);
      }
    }

    return NextResponse.json({
      ok: true,
      total: rows.length,
      sent,
      skipped,
      failed,
      failures,
    });
  } catch (err) {
    console.error("[tile-engine/send-batch] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
