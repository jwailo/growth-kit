import { db } from "@/db";
import {
  gkTileRecords,
  gkTileRuns,
  gkPms,
  gkAgencies,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { sendTileEmail } from "@/lib/email/sender";
import { eq, and, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
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
        pmId: gkTileRecords.pmId,
        responseTimeMins: gkTileRecords.responseTimeMins,
        agencyName: sql<string>`coalesce(${gkAgencies.displayName}, ${gkAgencies.name}, ${gkTileRecords.agencyName})`,
        tileUrlSquare: gkTileRecords.tileUrlSquare,
        tileUrlSquareNamed: gkTileRecords.tileUrlSquareNamed,
        tileUrlIg: gkTileRecords.tileUrlIg,
        tileUrlIgNamed: gkTileRecords.tileUrlIgNamed,
        period: gkTileRuns.period,
        pmFirstName: gkPms.firstName,
        pmEmail: gkPms.email,
        pmOptedOut: gkPms.optedOut,
      })
      .from(gkTileRecords)
      .innerJoin(gkTileRuns, eq(gkTileRecords.runId, gkTileRuns.id))
      .innerJoin(gkPms, eq(gkTileRecords.pmId, gkPms.id))
      .innerJoin(gkAgencies, eq(gkPms.agencyId, gkAgencies.id))
      .where(
        and(
          eq(gkTileRecords.runId, runId),
          eq(gkTileRecords.status, "generated"),
          isNull(gkTileRecords.sentAt),
        ),
      );

    const baseUrl = getBaseUrl(request);

    let sent = 0;
    let skipped = 0;
    let skippedNoEmail = 0;
    let skippedOptedOut = 0;
    let failed = 0;
    const failures: Array<{ recordId: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (!row.pmEmail) {
        skipped++;
        skippedNoEmail++;
        continue;
      }

      if (row.pmOptedOut) {
        skipped++;
        skippedOptedOut++;
        continue;
      }

      const tileImageUrl = row.tileUrlSquare ?? row.tileUrlIg;
      if (!tileImageUrl) {
        skipped++;
        continue;
      }

      const downloadAllUrl = `${baseUrl}/api/tile-engine/records/${row.recordId}/download-all`;
      const unsubscribeUrl = `${baseUrl}/unsubscribe/${row.pmId}`;

      const result = await sendTileEmail({
        to: row.pmEmail,
        firstName: row.pmFirstName,
        agencyName: row.agencyName,
        responseTimeMins: parseFloat(String(row.responseTimeMins)),
        period: row.period,
        tileImageUrl,
        tileUrlSquareNamed: row.tileUrlSquareNamed,
        tileUrlIg: row.tileUrlIg,
        tileUrlIgNamed: row.tileUrlIgNamed,
        downloadAllUrl,
        unsubscribeUrl,
        trackingBaseUrl: baseUrl,
        recordId: row.recordId,
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
      skippedNoEmail,
      skippedOptedOut,
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
