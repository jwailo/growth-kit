import { db } from "@/db";
import { gkAgencies, gkPms } from "@/db/schema/tile-engine";
import {
  gkAgencyWebsites,
  gkHeadshotMatches,
} from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "pending_review";

    const rows = await db
      .select({
        id: gkHeadshotMatches.id,
        pmId: gkHeadshotMatches.pmId,
        scrapedName: gkHeadshotMatches.scrapedName,
        scrapedImageUrl: gkHeadshotMatches.scrapedImageUrl,
        storedImageUrl: gkHeadshotMatches.storedImageUrl,
        confidence: gkHeadshotMatches.confidence,
        matchScore: gkHeadshotMatches.matchScore,
        status: gkHeadshotMatches.status,
        createdAt: gkHeadshotMatches.createdAt,
        pmFirstName: gkPms.firstName,
        pmLastName: gkPms.lastName,
        pmHeadshotUrl: gkPms.headshotUrl,
        agencyId: gkAgencies.id,
        agencyName: gkAgencies.name,
        agencyDisplayName: gkAgencies.displayName,
        teamPageUrl: gkAgencyWebsites.teamPageUrl,
      })
      .from(gkHeadshotMatches)
      .innerJoin(gkPms, eq(gkPms.id, gkHeadshotMatches.pmId))
      .innerJoin(gkAgencies, eq(gkAgencies.id, gkPms.agencyId))
      .innerJoin(
        gkAgencyWebsites,
        eq(gkAgencyWebsites.id, gkHeadshotMatches.agencyWebsiteId),
      )
      .where(eq(gkHeadshotMatches.status, status))
      .orderBy(gkAgencies.name);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[headshot-finder/matches GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
