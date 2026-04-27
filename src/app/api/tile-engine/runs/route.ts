import { db } from "@/db";
import { gkTileRecords, gkTileRuns } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const runs = await db
      .select({
        id: gkTileRuns.id,
        period: gkTileRuns.period,
        status: gkTileRuns.status,
        totalPms: gkTileRuns.totalPms,
        tilesGenerated: gkTileRuns.tilesGenerated,
        missingAssets: gkTileRuns.missingAssets,
        createdBy: gkTileRuns.createdBy,
        createdAt: gkTileRuns.createdAt,
        sentCount: sql<number>`coalesce(sum(case when ${gkTileRecords.sentAt} is not null then 1 else 0 end), 0)::int`,
      })
      .from(gkTileRuns)
      .leftJoin(gkTileRecords, eq(gkTileRecords.runId, gkTileRuns.id))
      .groupBy(gkTileRuns.id)
      .orderBy(desc(gkTileRuns.createdAt));

    return NextResponse.json({ runs });
  } catch (err) {
    console.error("[tile-engine/runs GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
