import { db } from "@/db";
import { gkAgencyWebsites } from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 30;

function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

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

    const { id: agencyId } = await params;
    const body = (await request.json()) as {
      websiteUrl?: string | null;
      teamPageUrl?: string | null;
    };

    const [existing] = await db
      .select()
      .from(gkAgencyWebsites)
      .where(eq(gkAgencyWebsites.agencyId, agencyId))
      .limit(1);

    if ("websiteUrl" in body) {
      const raw = body.websiteUrl ?? "";
      const normalised = raw === null ? "" : normaliseUrl(raw);

      if (!normalised) {
        if (existing) {
          await db
            .delete(gkAgencyWebsites)
            .where(eq(gkAgencyWebsites.id, existing.id));
        }
        return NextResponse.json({ ok: true });
      }

      if (existing) {
        const [updated] = await db
          .update(gkAgencyWebsites)
          .set({
            websiteUrl: normalised,
            scrapeStatus:
              existing.websiteUrl === normalised
                ? existing.scrapeStatus
                : "found",
            teamPageUrl:
              existing.websiteUrl === normalised ? existing.teamPageUrl : null,
          })
          .where(eq(gkAgencyWebsites.id, existing.id))
          .returning();
        return NextResponse.json(updated);
      }

      const [created] = await db
        .insert(gkAgencyWebsites)
        .values({
          agencyId,
          websiteUrl: normalised,
          scrapeStatus: "found",
        })
        .returning();
      return NextResponse.json(created);
    }

    if ("teamPageUrl" in body) {
      if (!existing) {
        return NextResponse.json(
          { error: "Add a website URL before setting a team page URL" },
          { status: 400 },
        );
      }
      const raw = body.teamPageUrl;
      const normalised =
        raw === null || raw === undefined || raw === ""
          ? null
          : normaliseUrl(raw);
      const nextStatus = normalised
        ? "scraped"
        : existing.scrapeStatus === "scraped"
          ? "found"
          : existing.scrapeStatus;
      const [updated] = await db
        .update(gkAgencyWebsites)
        .set({ teamPageUrl: normalised, scrapeStatus: nextStatus })
        .where(eq(gkAgencyWebsites.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[headshot-finder/agencies/[id] PATCH] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
