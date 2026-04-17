import { db } from "@/db";
import { gkAgencies } from "@/db/schema/tile-engine";
import { gkAgencyWebsites } from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import {
  CLAUDE_MODEL,
  extractJson,
  getAnthropic,
  getFirecrawl,
  sleep,
} from "@/lib/headshot-finder/clients";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const DELAY_MS = 2000;
const EXCLUDED_HOSTS = [
  "realestate.com.au",
  "domain.com.au",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "google.com",
  "wikipedia.org",
  "yelp.com",
  "yellowpages.com.au",
  "truelocal.com.au",
  "whitepages.com.au",
];

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isExcluded(url: string): boolean {
  const host = hostOf(url);
  if (!host) return true;
  return EXCLUDED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

type AgencyToDiscover = {
  id: string;
  name: string;
};

type SearchResult = {
  url: string;
  title?: string;
  description?: string;
};

async function pickBestUrl(
  agencyName: string,
  candidates: SearchResult[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].url;

  const anthropic = getAnthropic();
  const listing = candidates
    .map(
      (c, i) =>
        `${i + 1}. URL: ${c.url}\n   Title: ${c.title ?? ""}\n   Description: ${c.description ?? ""}`,
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Pick the official company website for the Australian property management agency "${agencyName}" from these search results. Do NOT pick directories (realestate.com.au, domain.com.au), social media, or news articles. If none match, respond with "none".

Respond as JSON: {"index": <1-based number>, "url": "<full URL>"} or {"index": null}.

Results:
${listing}`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("");
  const parsed = extractJson<{ index: number | null; url?: string }>(text);
  if (!parsed || parsed.index === null || parsed.index === undefined)
    return null;
  const idx = parsed.index - 1;
  if (idx < 0 || idx >= candidates.length) return null;
  return candidates[idx].url;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const rows = await db
      .select({
        id: gkAgencies.id,
        name: gkAgencies.name,
        websiteId: gkAgencyWebsites.id,
      })
      .from(gkAgencies)
      .leftJoin(
        gkAgencyWebsites,
        eq(gkAgencyWebsites.agencyId, gkAgencies.id),
      );

    const toDiscover: AgencyToDiscover[] = rows
      .filter((r) => !r.websiteId)
      .map((r) => ({ id: r.id, name: r.name }));

    const batch = toDiscover.slice(0, BATCH_SIZE);

    const firecrawl = getFirecrawl();
    let found = 0;
    let missed = 0;
    const errors: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const agency = batch[i];
      try {
        const searchData = await firecrawl.search(
          `"${agency.name}" property management Australia`,
          { limit: 8 },
        );

        const webResults: SearchResult[] = [];
        for (const r of searchData.web ?? []) {
          if ("url" in r && typeof r.url === "string") {
            const url = r.url;
            if (isExcluded(url)) continue;
            const title =
              "title" in r && typeof r.title === "string" ? r.title : undefined;
            const description =
              "description" in r && typeof r.description === "string"
                ? r.description
                : undefined;
            webResults.push({ url, title, description });
          }
        }

        const picked = await pickBestUrl(agency.name, webResults);

        if (picked) {
          await db.insert(gkAgencyWebsites).values({
            agencyId: agency.id,
            websiteUrl: picked,
            scrapeStatus: "found",
          });
          found++;
        } else {
          missed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${agency.name}: ${message}`);
      }

      if (i < batch.length - 1) await sleep(DELAY_MS);
    }

    return NextResponse.json({
      summary: `Processed ${batch.length} agencies: ${found} websites found, ${missed} without a match${errors.length ? `, ${errors.length} errors` : ""}. ${Math.max(toDiscover.length - batch.length, 0)} remaining.`,
      found,
      missed,
      errors,
      remaining: Math.max(toDiscover.length - batch.length, 0),
    });
  } catch (err) {
    console.error("[headshot-finder/discover] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
