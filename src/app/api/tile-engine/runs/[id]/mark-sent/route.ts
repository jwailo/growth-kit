import { db } from "@/db";
import { gkTileRecords } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { recordId, sent } = await request.json();

  await db
    .update(gkTileRecords)
    .set({ sentAt: sent ? new Date() : null })
    .where(eq(gkTileRecords.id, recordId));

  return NextResponse.json({ ok: true });
}
