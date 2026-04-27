import { db } from "@/db";
import {
  gkTileRecords,
  gkTileRuns,
  gkPms,
  gkAgencies,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { buildDownloadLinks, buildEmailHtml } from "@/lib/email/format";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers
    .get("x-forwarded-proto")
    ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { recordId } = await params;

    const [row] = await db
      .select({
        recordId: gkTileRecords.id,
        responseTimeMins: gkTileRecords.responseTimeMins,
        agencyName: sql<string>`coalesce(${gkAgencies.displayName}, ${gkAgencies.name}, ${gkTileRecords.agencyName})`,
        tileUrlSquare: gkTileRecords.tileUrlSquare,
        tileUrlSquareNamed: gkTileRecords.tileUrlSquareNamed,
        tileUrlIg: gkTileRecords.tileUrlIg,
        tileUrlIgNamed: gkTileRecords.tileUrlIgNamed,
        period: gkTileRuns.period,
        pmFirstName: gkPms.firstName,
      })
      .from(gkTileRecords)
      .innerJoin(gkTileRuns, eq(gkTileRecords.runId, gkTileRuns.id))
      .innerJoin(gkPms, eq(gkTileRecords.pmId, gkPms.id))
      .innerJoin(gkAgencies, eq(gkPms.agencyId, gkAgencies.id))
      .where(eq(gkTileRecords.id, recordId));

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const tileImageSrc = row.tileUrlSquare ?? row.tileUrlIg;
    if (!tileImageSrc) {
      return NextResponse.json(
        { error: "No tile image available for this record" },
        { status: 400 },
      );
    }

    const baseUrl = getBaseUrl(request);
    const downloadAllUrl = `${baseUrl}/api/tile-engine/records/${row.recordId}/download-all`;

    const downloadLinks = buildDownloadLinks({
      tileUrlSquareNamed: row.tileUrlSquareNamed,
      tileUrlIg: row.tileUrlIg,
      tileUrlIgNamed: row.tileUrlIgNamed,
      downloadAllUrl,
    });

    const html = buildEmailHtml({
      firstName: row.pmFirstName,
      agencyName: row.agencyName,
      responseTimeMins: parseFloat(String(row.responseTimeMins)),
      period: row.period,
      tileImageSrc,
      downloadLinks,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[tile-engine/preview-email] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
