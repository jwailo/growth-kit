import { createClient } from "@/lib/supabase/server";
import { approveMatch, rejectMatch } from "@/lib/headshot-finder/apply";
import { NextResponse } from "next/server";

export const maxDuration = 60;

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
    const body = (await request.json()) as { action?: string };

    if (body.action === "approve") {
      const result = await approveMatch(supabase, id);
      if (!result.ok)
        return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }

    if (body.action === "reject") {
      const result = await rejectMatch(supabase, id);
      if (!result.ok)
        return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Unknown action. Use 'approve' or 'reject'." },
      { status: 400 },
    );
  } catch (err) {
    console.error("[headshot-finder/matches/[id] PATCH] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
