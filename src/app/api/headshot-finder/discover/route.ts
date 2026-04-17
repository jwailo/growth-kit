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

export const maxDuration = 800;

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
    .leftJoin(gkAgencyWebsites, eq(gkAgencyWebsites.agencyId, gkAgencies.id));

  const toDiscover: AgencyToDiscover[] = rows
    .filter((r) => !r.websiteId)
    .map((r) => ({ id: r.id, name: r.name }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      send({ type: "start", total: toDiscover.length });

      if (toDiscover.length === 0) {
        send({
          type: "done",
          total: 0,
          found: 0,
          missed: 0,
          errors: [],
          summary: "No agencies needing website discovery.",
        });
        controller.close();
        return;
      }

      const firecrawl = getFirecrawl();
      let found = 0;
      let missed = 0;
      const errors: string[] = [];

      for (let i = 0; i < toDiscover.length; i++) {
        const agency = toDiscover[i];
        send({
          type: "progress",
          current: i + 1,
          total: toDiscover.length,
          agency: agency.name,
        });

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
                "title" in r && typeof r.title === "string"
                  ? r.title
                  : undefined;
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
            send({
              type: "result",
              agency: agency.name,
              outcome: "found",
              url: picked,
              current: i + 1,
              total: toDiscover.length,
              found,
              missed,
              errorCount: errors.length,
            });
          } else {
            missed++;
            send({
              type: "result",
              agency: agency.name,
              outcome: "missed",
              current: i + 1,
              total: toDiscover.length,
              found,
              missed,
              errorCount: errors.length,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${agency.name}: ${message}`);
          send({
            type: "result",
            agency: agency.name,
            outcome: "error",
            error: message,
            current: i + 1,
            total: toDiscover.length,
            found,
            missed,
            errorCount: errors.length,
          });
        }

        if (i < toDiscover.length - 1) await sleep(DELAY_MS);
      }

      send({
        type: "done",
        total: toDiscover.length,
        found,
        missed,
        errors,
        summary: `Processed ${toDiscover.length} agencies: ${found} websites found, ${missed} without a match${errors.length ? `, ${errors.length} errors` : ""}.`,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
