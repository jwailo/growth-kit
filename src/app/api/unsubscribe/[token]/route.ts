import { db } from "@/db";
import { gkPms } from "@/db/schema/tile-engine";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const result = await db
      .update(gkPms)
      .set({ optedOut: true, optedOutAt: new Date() })
      .where(eq(gkPms.id, token))
      .returning({ id: gkPms.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[unsubscribe] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
