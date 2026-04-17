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
import { getFranchisePaths } from "@/lib/headshot-finder/franchise-patterns";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const BATCH_SIZE = 10;
const DELAY_MS = 1000;
const SITE_TIMEOUT_MS = 30000;

type WebsiteRow = {
  id: string;
  agencyId: string;
  agencyName: string;
  websiteUrl: string;
};

function joinUrl(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
  }
}

async function headOk(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.ok) return true;
    if (res.status === 405) {
      const getRes = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      return getRes.ok;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Operation timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function looksLikeTeamPath(url: string): boolean {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  const keywords = [
    "team",
    "agents",
    "people",
    "staff",
    "our-people",
    "our-agents",
    "property-managers",
    "meet",
    "about-us/team",
    "about/team",
  ];
  return keywords.some((k) => path.includes(k));
}

async function pickBestTeamPage(
  agencyName: string,
  candidates: string[],
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const anthropic = getAnthropic();
  const listing = candidates
    .map((url, i) => `${i + 1}. ${url}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `From these URLs on the website for property management agency "${agencyName}", pick the single best page that lists the agents / property managers / team members. Prefer pages named /team, /our-team, /agents, /people. If none look like a team page, respond with {"index": null}.

Respond only as JSON: {"index": <1-based number>}.

URLs:
${listing}`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("");
  const parsed = extractJson<{ index: number | null }>(text);
  if (!parsed || parsed.index === null || parsed.index === undefined)
    return null;
  const idx = parsed.index - 1;
  if (idx < 0 || idx >= candidates.length) return null;
  return candidates[idx];
}

async function findTeamPage(row: WebsiteRow): Promise<string | null> {
  const franchisePaths = getFranchisePaths(row.agencyName);
  if (franchisePaths) {
    for (const path of franchisePaths) {
      const url = joinUrl(row.websiteUrl, path);
      if (await headOk(url)) return url;
    }
  }

  const firecrawl = getFirecrawl();
  const mapResult = await withTimeout(
    firecrawl.map(row.websiteUrl, {
      limit: 40,
      includeSubdomains: false,
    }),
    SITE_TIMEOUT_MS,
  );

  const links = (mapResult.links ?? [])
    .map((l) => l.url)
    .filter((l): l is string => typeof l === "string" && l.length > 0);

  const teamCandidates = links.filter(looksLikeTeamPath);
  if (teamCandidates.length > 0) {
    const picked = await pickBestTeamPage(row.agencyName, teamCandidates);
    if (picked) return picked;
  }

  const topLinks = links.slice(0, 20);
  if (topLinks.length > 0) {
    const picked = await pickBestTeamPage(row.agencyName, topLinks);
    if (picked && looksLikeTeamPath(picked)) return picked;
  }

  return null;
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
        id: gkAgencyWebsites.id,
        agencyId: gkAgencyWebsites.agencyId,
        agencyName: gkAgencies.name,
        websiteUrl: gkAgencyWebsites.websiteUrl,
      })
      .from(gkAgencyWebsites)
      .innerJoin(gkAgencies, eq(gkAgencies.id, gkAgencyWebsites.agencyId))
      .where(eq(gkAgencyWebsites.scrapeStatus, "found"));

    const batch = rows.slice(0, BATCH_SIZE);
    let scraped = 0;
    let noTeamPage = 0;
    let errored = 0;
    const errors: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const site = batch[i];
      const now = new Date();
      try {
        const teamPage = await findTeamPage(site);
        if (teamPage) {
          await db
            .update(gkAgencyWebsites)
            .set({
              teamPageUrl: teamPage,
              scrapeStatus: "scraped",
              lastScrapedAt: now,
            })
            .where(eq(gkAgencyWebsites.id, site.id));
          scraped++;
        } else {
          await db
            .update(gkAgencyWebsites)
            .set({
              scrapeStatus: "no_team_page",
              lastScrapedAt: now,
            })
            .where(eq(gkAgencyWebsites.id, site.id));
          noTeamPage++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${site.agencyName}: ${message}`);
        errored++;
        await db
          .update(gkAgencyWebsites)
          .set({ scrapeStatus: "error", lastScrapedAt: now })
          .where(eq(gkAgencyWebsites.id, site.id));
      }

      if (i < batch.length - 1) await sleep(DELAY_MS);
    }

    return NextResponse.json({
      summary: `Processed ${batch.length} sites: ${scraped} team pages found, ${noTeamPage} without a team page, ${errored} errored. ${Math.max(rows.length - batch.length, 0)} remaining.`,
      scraped,
      noTeamPage,
      errored,
      errors,
      remaining: Math.max(rows.length - batch.length, 0),
    });
  } catch (err) {
    console.error("[headshot-finder/scrape] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
