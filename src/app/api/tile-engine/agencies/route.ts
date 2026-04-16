import { db } from "@/db";
import { gkAgencies, gkPms } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const agencies = await db
    .select({
      id: gkAgencies.id,
      name: gkAgencies.name,
      logoUrl: gkAgencies.logoUrl,
      createdAt: gkAgencies.createdAt,
      pmCount: sql<number>`count(${gkPms.id})::int`,
    })
    .from(gkAgencies)
    .leftJoin(gkPms, eq(gkPms.agencyId, gkAgencies.id))
    .groupBy(gkAgencies.id)
    .orderBy(gkAgencies.name);

  return NextResponse.json(agencies);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const [agency] = await db
    .insert(gkAgencies)
    .values({ name: body.name })
    .returning();

  return NextResponse.json(agency);
}
