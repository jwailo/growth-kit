import { db } from "@/db";
import { gkTileRuns, gkTileRecords, gkPms } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { id } = await params;

    const [run] = await db
      .select()
      .from(gkTileRuns)
      .where(eq(gkTileRuns.id, id));

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const records = await db
      .select({
        id: gkTileRecords.id,
        pmId: gkTileRecords.pmId,
        agencyName: gkTileRecords.agencyName,
        responseTimeMins: gkTileRecords.responseTimeMins,
        tileUrlSquare: gkTileRecords.tileUrlSquare,
        tileUrlSquareNamed: gkTileRecords.tileUrlSquareNamed,
        tileUrlIg: gkTileRecords.tileUrlIg,
        tileUrlIgNamed: gkTileRecords.tileUrlIgNamed,
        status: gkTileRecords.status,
        sentAt: gkTileRecords.sentAt,
        pmFirstName: gkPms.firstName,
        pmLastName: gkPms.lastName,
        pmEmail: gkPms.email,
      })
      .from(gkTileRecords)
      .innerJoin(gkPms, eq(gkTileRecords.pmId, gkPms.id))
      .where(eq(gkTileRecords.runId, id))
      .orderBy(gkPms.lastName, gkPms.firstName);

    return NextResponse.json({ run, records });
  } catch (err) {
    console.error("[tile-engine/runs/[id] GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
