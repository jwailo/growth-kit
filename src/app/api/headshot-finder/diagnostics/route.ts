import { db } from "@/db";
import { gkAgencies } from "@/db/schema/tile-engine";
import {
  gkAgencyWebsites,
  gkExtractionMisses,
  gkHeadshotMatches,
} from "@/db/schema/headshot-finder";
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
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const [totalsRow] = await db
      .select({
        extracted: sql<number>`coalesce(sum(${gkAgencyWebsites.extractedCount}), 0)::int`,
        matched: sql<number>`coalesce(sum(${gkAgencyWebsites.matchedCount}), 0)::int`,
        sitesExtracted: sql<number>`count(*) filter (where ${gkAgencyWebsites.extractedCount} > 0)::int`,
      })
      .from(gkAgencyWebsites);

    const breakdownRows = await db
      .select({
        confidence: gkHeadshotMatches.confidence,
        count: sql<number>`count(*)::int`,
      })
      .from(gkHeadshotMatches)
      .groupBy(gkHeadshotMatches.confidence);

    const confidence = { exact: 0, fuzzy: 0, uncertain: 0 };
    for (const row of breakdownRows) {
      if (row.confidence === "exact") confidence.exact = row.count;
      else if (row.confidence === "fuzzy") confidence.fuzzy = row.count;
      else if (row.confidence === "uncertain")
        confidence.uncertain = row.count;
    }

    const misses = await db
      .select({
        id: gkExtractionMisses.id,
        scrapedName: gkExtractionMisses.scrapedName,
        pmCandidates: gkExtractionMisses.pmCandidates,
        createdAt: gkExtractionMisses.createdAt,
        agencyId: gkAgencies.id,
        agencyName: gkAgencies.name,
        agencyDisplayName: gkAgencies.displayName,
        teamPageUrl: gkAgencyWebsites.teamPageUrl,
      })
      .from(gkExtractionMisses)
      .innerJoin(
        gkAgencyWebsites,
        eq(gkAgencyWebsites.id, gkExtractionMisses.agencyWebsiteId),
      )
      .innerJoin(gkAgencies, eq(gkAgencies.id, gkAgencyWebsites.agencyId))
      .orderBy(desc(gkExtractionMisses.createdAt))
      .limit(25);

    const extracted = totalsRow?.extracted ?? 0;
    const matched = totalsRow?.matched ?? 0;
    const matchRate = extracted > 0 ? matched / extracted : 0;

    return NextResponse.json({
      totals: {
        extracted,
        matched,
        matchRate: Number(matchRate.toFixed(4)),
        sitesExtracted: totalsRow?.sitesExtracted ?? 0,
      },
      confidence,
      misses,
    });
  } catch (err) {
    console.error("[headshot-finder/diagnostics] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
