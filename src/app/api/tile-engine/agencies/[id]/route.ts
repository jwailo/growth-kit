import { db } from "@/db";
import { gkAgencies } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function PATCH(
  request: Request,
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
    const body = (await request.json()) as {
      displayName?: string | null;
    };

    const updates: { displayName?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if ("displayName" in body) {
      const value = body.displayName;
      if (value === null || value === undefined) {
        updates.displayName = null;
      } else if (typeof value === "string") {
        const trimmed = value.trim();
        updates.displayName = trimmed.length === 0 ? null : trimmed;
      }
    }

    const [updated] = await db
      .update(gkAgencies)
      .set(updates)
      .where(eq(gkAgencies.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Agency not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[tile-engine/agencies/[id] PATCH] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
