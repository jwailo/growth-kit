import { db } from "@/db";
import { gkEmailEvents, gkTileRecords } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

type PerPm = {
  opened: boolean;
  firstOpenedAt: string | null;
  clicked: boolean;
  linksClicked: string[];
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { id } = await params;

    const records = await db
      .select({
        id: gkTileRecords.id,
        sentAt: gkTileRecords.sentAt,
      })
      .from(gkTileRecords)
      .where(eq(gkTileRecords.runId, id));

    const recordIds = records.map((r) => r.id);
    const events =
      recordIds.length === 0
        ? []
        : await db
            .select({
              tileRecordId: gkEmailEvents.tileRecordId,
              eventType: gkEmailEvents.eventType,
              linkName: gkEmailEvents.linkName,
              createdAt: gkEmailEvents.createdAt,
            })
            .from(gkEmailEvents)
            .where(inArray(gkEmailEvents.tileRecordId, recordIds));

    const perPm: Record<string, PerPm> = {};
    for (const r of records) {
      perPm[r.id] = {
        opened: false,
        firstOpenedAt: null,
        clicked: false,
        linksClicked: [],
      };
    }

    const clicksByLink: Record<string, number> = {};
    let totalClicks = 0;

    for (const e of events) {
      const entry = perPm[e.tileRecordId];
      if (!entry) continue;
      if (e.eventType === "open") {
        entry.opened = true;
        const ts = e.createdAt.toISOString();
        if (!entry.firstOpenedAt || ts < entry.firstOpenedAt) {
          entry.firstOpenedAt = ts;
        }
      } else if (e.eventType === "click") {
        entry.clicked = true;
        totalClicks++;
        if (e.linkName) {
          if (!entry.linksClicked.includes(e.linkName)) {
            entry.linksClicked.push(e.linkName);
          }
          clicksByLink[e.linkName] = (clicksByLink[e.linkName] ?? 0) + 1;
        }
      }
    }

    const sentRecords = records.filter((r) => r.sentAt);
    const sentSet = new Set(sentRecords.map((r) => r.id));
    const totalSent = sentRecords.length;
    let opened = 0;
    let clicked = 0;
    for (const [recordId, entry] of Object.entries(perPm)) {
      if (!sentSet.has(recordId)) continue;
      if (entry.opened) opened++;
      if (entry.clicked) clicked++;
    }

    return NextResponse.json({
      totalSent,
      opened,
      openRate: totalSent > 0 ? opened / totalSent : 0,
      clicked,
      clickRate: totalSent > 0 ? clicked / totalSent : 0,
      totalClicks,
      clicksByLink,
      perPm,
    });
  } catch (err) {
    console.error("[tile-engine/runs/[id]/analytics] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
