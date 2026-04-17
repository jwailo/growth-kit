import { db } from "@/db";
import {
  gkTileRecords,
  gkTileRuns,
  gkPms,
  gkAgencies,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { sendTileEmail } from "@/lib/email/sender";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 60;

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

    const { recordId } = await request.json();
    if (!recordId) {
      return NextResponse.json(
        { error: "recordId is required" },
        { status: 400 },
      );
    }

    const [row] = await db
      .select({
        recordId: gkTileRecords.id,
        status: gkTileRecords.status,
        responseTimeMins: gkTileRecords.responseTimeMins,
        agencyName: sql<string>`coalesce(${gkAgencies.displayName}, ${gkAgencies.name}, ${gkTileRecords.agencyName})`,
        tileUrlSquare: gkTileRecords.tileUrlSquare,
        tileUrlSquareNamed: gkTileRecords.tileUrlSquareNamed,
        tileUrlIg: gkTileRecords.tileUrlIg,
        tileUrlIgNamed: gkTileRecords.tileUrlIgNamed,
        period: gkTileRuns.period,
        pmFirstName: gkPms.firstName,
        pmEmail: gkPms.email,
      })
      .from(gkTileRecords)
      .innerJoin(gkTileRuns, eq(gkTileRecords.runId, gkTileRuns.id))
      .innerJoin(gkPms, eq(gkTileRecords.pmId, gkPms.id))
      .innerJoin(gkAgencies, eq(gkPms.agencyId, gkAgencies.id))
      .where(eq(gkTileRecords.id, recordId));

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (row.status !== "generated") {
      return NextResponse.json(
        { error: "Tile not generated yet" },
        { status: 400 },
      );
    }

    if (!row.pmEmail) {
      return NextResponse.json(
        { ok: false, skipped: true, reason: "no_email" },
        { status: 200 },
      );
    }

    const tileImageUrl = row.tileUrlSquare ?? row.tileUrlIg;
    if (!tileImageUrl) {
      return NextResponse.json(
        { error: "No tile image available for this record" },
        { status: 400 },
      );
    }

    const baseUrl = getBaseUrl(request);
    const downloadAllUrl = `${baseUrl}/api/tile-engine/records/${row.recordId}/download-all`;

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
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Send failed" },
        { status: 500 },
      );
    }

    await db
      .update(gkTileRecords)
      .set({ sentAt: new Date() })
      .where(eq(gkTileRecords.id, recordId));

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    console.error("[tile-engine/send-email] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
