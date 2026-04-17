import { db } from "@/db";
import { gkPms, gkAgencies } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const agencyId = request.nextUrl.searchParams.get("agencyId");
    const missingOnly =
      request.nextUrl.searchParams.get("missingOnly") === "true";

    let query = db
      .select({
        id: gkPms.id,
        firstName: gkPms.firstName,
        lastName: gkPms.lastName,
        email: gkPms.email,
        agencyId: gkPms.agencyId,
        agencyName: gkAgencies.name,
        headshotUrl: gkPms.headshotUrl,
        createdAt: gkPms.createdAt,
      })
      .from(gkPms)
      .innerJoin(gkAgencies, eq(gkPms.agencyId, gkAgencies.id))
      .orderBy(gkPms.lastName, gkPms.firstName)
      .$dynamic();

    if (agencyId) {
      query = query.where(eq(gkPms.agencyId, agencyId));
    }

    const pms = await query;

    if (missingOnly) {
      return NextResponse.json(pms.filter((pm) => !pm.headshotUrl));
    }

    return NextResponse.json(pms);
  } catch (err) {
    console.error("[tile-engine/pms GET] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await request.json();
    const [pm] = await db
      .insert(gkPms)
      .values({
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email || null,
        agencyId: body.agencyId,
      })
      .returning();

    return NextResponse.json(pm);
  } catch (err) {
    console.error("[tile-engine/pms POST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
