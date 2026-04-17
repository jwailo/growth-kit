import { db } from "@/db";
import { gkHeadshotMatches } from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import { approveMatch } from "@/lib/headshot-finder/apply";
import { and, eq } from "drizzle-orm";
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

    const body = (await request.json()) as { confidence?: string };
    const confidence = body.confidence;
    if (confidence !== "exact" && confidence !== "all") {
      return NextResponse.json(
        { error: "confidence must be 'exact' or 'all'" },
        { status: 400 },
      );
    }

    const where =
      confidence === "exact"
        ? and(
            eq(gkHeadshotMatches.status, "pending_review"),
            eq(gkHeadshotMatches.confidence, "exact"),
          )
        : eq(gkHeadshotMatches.status, "pending_review");

    const pending = await db
      .select({ id: gkHeadshotMatches.id })
      .from(gkHeadshotMatches)
      .where(where);

    let approved = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of pending) {
      const result = await approveMatch(supabase, row.id);
      if (result.ok) {
        approved++;
      } else {
        failed++;
        errors.push(`${row.id}: ${result.error}`);
      }
    }

    return NextResponse.json({
      approved,
      failed,
      errors,
      summary: `Approved ${approved} match${approved === 1 ? "" : "es"}${failed ? `, ${failed} failed` : ""}.`,
    });
  } catch (err) {
    console.error("[headshot-finder/bulk-approve] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
