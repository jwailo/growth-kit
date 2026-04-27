import { db } from "@/db";
import {
  gkAgencies,
  gkEmailEvents,
  gkPms,
  gkTileRecords,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

type PerPm = {
  recordId: string;
  pmFirstName: string;
  pmLastName: string;
  agencyName: string;
  pmEmail: string | null;
  sentAt: string | null;
  opened: boolean;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  clicked: boolean;
  linksClicked: string[];
  totalClicks: number;
};

function toDay(iso: string): string {
  return iso.slice(0, 10);
}

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
        pmFirstName: gkPms.firstName,
        pmLastName: gkPms.lastName,
        pmEmail: gkPms.email,
        agencyName: sql<string>`coalesce(${gkAgencies.displayName}, ${gkAgencies.name}, ${gkTileRecords.agencyName})`,
      })
      .from(gkTileRecords)
      .innerJoin(gkPms, eq(gkPms.id, gkTileRecords.pmId))
      .innerJoin(gkAgencies, eq(gkAgencies.id, gkPms.agencyId))
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
        recordId: r.id,
        pmFirstName: r.pmFirstName,
        pmLastName: r.pmLastName,
        agencyName: r.agencyName,
        pmEmail: r.pmEmail,
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        opened: false,
        openCount: 0,
        firstOpenedAt: null,
        lastOpenedAt: null,
        clicked: false,
        linksClicked: [],
        totalClicks: 0,
      };
    }

    const clicksByLink: Record<string, number> = {};
    const opensByDay: Record<string, number> = {};
    const clicksByDay: Record<string, number> = {};
    let totalClicks = 0;

    for (const e of events) {
      const entry = perPm[e.tileRecordId];
      if (!entry) continue;
      const ts = e.createdAt.toISOString();
      const day = toDay(ts);
      if (e.eventType === "open") {
        entry.opened = true;
        entry.openCount++;
        if (!entry.firstOpenedAt || ts < entry.firstOpenedAt) {
          entry.firstOpenedAt = ts;
        }
        if (!entry.lastOpenedAt || ts > entry.lastOpenedAt) {
          entry.lastOpenedAt = ts;
        }
        opensByDay[day] = (opensByDay[day] ?? 0) + 1;
      } else if (e.eventType === "click") {
        entry.clicked = true;
        entry.totalClicks++;
        totalClicks++;
        clicksByDay[day] = (clicksByDay[day] ?? 0) + 1;
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

    const allDays = new Set<string>([
      ...Object.keys(opensByDay),
      ...Object.keys(clicksByDay),
    ]);
    const timeseries = Array.from(allDays)
      .sort()
      .map((day) => ({
        day,
        opens: opensByDay[day] ?? 0,
        clicks: clicksByDay[day] ?? 0,
      }));

    return NextResponse.json({
      totalSent,
      opened,
      openRate: totalSent > 0 ? opened / totalSent : 0,
      clicked,
      clickRate: totalSent > 0 ? clicked / totalSent : 0,
      totalClicks,
      clicksByLink,
      timeseries,
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
