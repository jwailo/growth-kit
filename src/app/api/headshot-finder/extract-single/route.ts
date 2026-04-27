import { db } from "@/db";
import { gkAgencies } from "@/db/schema/tile-engine";
import { gkAgencyWebsites } from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import { extractAndMatchSite } from "@/lib/headshot-finder/extract";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      agencyWebsiteId?: string;
    };
    const websiteId = body.agencyWebsiteId;
    if (!websiteId) {
      return NextResponse.json(
        { error: "agencyWebsiteId is required" },
        { status: 400 },
      );
    }

    const [site] = await db
      .select({
        id: gkAgencyWebsites.id,
        agencyId: gkAgencyWebsites.agencyId,
        agencyName: gkAgencies.name,
        teamPageUrl: gkAgencyWebsites.teamPageUrl,
      })
      .from(gkAgencyWebsites)
      .innerJoin(gkAgencies, eq(gkAgencies.id, gkAgencyWebsites.agencyId))
      .where(eq(gkAgencyWebsites.id, websiteId))
      .limit(1);

    if (!site) {
      return NextResponse.json(
        { error: "Agency website not found" },
        { status: 404 },
      );
    }
    if (!site.teamPageUrl) {
      return NextResponse.json(
        { error: "This agency has no team page URL" },
        { status: 400 },
      );
    }

    const result = await extractAndMatchSite(supabase, {
      websiteId: site.id,
      agencyId: site.agencyId,
      agencyName: site.agencyName,
      teamPageUrl: site.teamPageUrl,
    });

    return NextResponse.json({
      ok: true,
      agencyName: site.agencyName,
      extracted: result.extracted,
      matched: result.matched,
      duplicatesSkipped: result.duplicatesSkipped,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[headshot-finder/extract-single] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
