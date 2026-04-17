import { db } from "@/db";
import { gkPms } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const body = (await request.json()) as { email?: string | null };

    const updates: { email?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if ("email" in body) {
      const value = body.email;
      if (value === null || value === undefined) {
        updates.email = null;
      } else if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          updates.email = null;
        } else if (!EMAIL_RE.test(trimmed)) {
          return NextResponse.json(
            { error: "Invalid email address" },
            { status: 400 },
          );
        } else {
          updates.email = trimmed;
        }
      }
    }

    const [updated] = await db
      .update(gkPms)
      .set(updates)
      .where(eq(gkPms.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "PM not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[tile-engine/pms/[id] PATCH] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
