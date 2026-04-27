import { db } from "@/db";
import { gkAgencies, gkPms } from "@/db/schema/tile-engine";
import {
  gkAgencyWebsites,
  gkHeadshotMatches,
} from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const agencies = await db
      .select({
        id: gkAgencies.id,
        name: gkAgencies.name,
        displayName: gkAgencies.displayName,
        pmCount: sql<number>`count(distinct ${gkPms.id})::int`,
        websiteId: gkAgencyWebsites.id,
        websiteUrl: gkAgencyWebsites.websiteUrl,
        teamPageUrl: gkAgencyWebsites.teamPageUrl,
        scrapeStatus: gkAgencyWebsites.scrapeStatus,
        lastScrapedAt: gkAgencyWebsites.lastScrapedAt,
        extractedCount: gkAgencyWebsites.extractedCount,
        matchedCount: gkAgencyWebsites.matchedCount,
      })
      .from(gkAgencies)
      .leftJoin(gkPms, eq(gkPms.agencyId, gkAgencies.id))
      .leftJoin(
        gkAgencyWebsites,
        eq(gkAgencyWebsites.agencyId, gkAgencies.id),
      )
      .groupBy(gkAgencies.id, gkAgencyWebsites.id)
      .orderBy(gkAgencies.name);

    const [pendingRow] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(gkHeadshotMatches)
      .where(eq(gkHeadshotMatches.status, "pending_review"));

    const [appliedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gkHeadshotMatches)
      .where(eq(gkHeadshotMatches.status, "applied"));

    const [rejectedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gkHeadshotMatches)
      .where(eq(gkHeadshotMatches.status, "rejected"));

    const totals = {
      totalAgencies: agencies.length,
      withWebsites: agencies.filter((a) => a.websiteUrl).length,
      withTeamPages: agencies.filter((a) => a.teamPageUrl).length,
      pendingReview: pendingRow?.count ?? 0,
      applied: appliedRow?.count ?? 0,
      rejected: rejectedRow?.count ?? 0,
    };

    return NextResponse.json({ agencies, totals });
  } catch (err) {
    console.error("[headshot-finder/agencies GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
