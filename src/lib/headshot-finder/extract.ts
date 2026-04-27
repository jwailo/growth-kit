import { db } from "@/db";
import { gkPms } from "@/db/schema/tile-engine";
import {
  gkAgencyWebsites,
  gkExtractionMisses,
  gkHeadshotMatches,
} from "@/db/schema/headshot-finder";
import {
  CLAUDE_MODEL,
  extractJson,
  getAnthropic,
  getFirecrawl,
} from "./clients";
import { scoreNameMatch } from "./matching";
import { eq } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_HTML_CHARS = 180000;
const MAX_MISS_SAMPLES = 5;

export type ExtractSiteInput = {
  websiteId: string;
  agencyId: string;
  agencyName: string;
  teamPageUrl: string;
};

export type ExtractSiteResult = {
  extracted: number;
  matched: number;
  duplicatesSkipped: number;
  errors: string[];
};

type ExtractedPerson = {
  name: string;
  imageUrl: string;
  role?: string;
};

function resolveUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

function isPlausibleImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
  const lower = url.toLowerCase();
  if (lower.includes("placeholder")) return false;
  if (lower.includes("avatar-default")) return false;
  if (lower.includes("noavatar")) return false;
  return true;
}

async function extractPeopleFromHtml(
  agencyName: string,
  html: string,
): Promise<ExtractedPerson[]> {
  const anthropic = getAnthropic();
  const trimmed =
    html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are extracting team members from the HTML of an Australian real estate agency's team page. The agency is "${agencyName}".

Extract all team members with name, imageUrl (full URL as it appears in the HTML), and role. Return JSON array. Only include entries with both name AND image. Skip placeholder avatars, silhouettes, or default/generic icons. Keep the imageUrl exactly as it appears in the <img src="..."> attribute — do not invent URLs.

Respond only as a JSON array:
[{"name": "Jane Doe", "imageUrl": "https://...", "role": "Property Manager"}]

HTML:
${trimmed}`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("");
  const parsed = extractJson<ExtractedPerson[]>(text);
  if (!parsed || !Array.isArray(parsed)) return [];
  return parsed.filter(
    (p) =>
      p &&
      typeof p.name === "string" &&
      typeof p.imageUrl === "string" &&
      p.name.trim() &&
      p.imageUrl.trim(),
  );
}

async function downloadImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractAndMatchSite(
  supabase: SupabaseClient,
  site: ExtractSiteInput,
): Promise<ExtractSiteResult> {
  const errors: string[] = [];
  let extracted = 0;
  let matched = 0;
  let duplicatesSkipped = 0;

  const firecrawl = getFirecrawl();
  const scrape = await firecrawl.scrape(site.teamPageUrl, {
    formats: ["html"],
    onlyMainContent: false,
  });
  const html = scrape.html ?? scrape.rawHtml ?? "";
  if (!html) {
    errors.push(`${site.agencyName}: empty scrape`);
    return { extracted, matched, duplicatesSkipped, errors };
  }

  const people = await extractPeopleFromHtml(site.agencyName, html);

  const pms = await db
    .select({
      id: gkPms.id,
      firstName: gkPms.firstName,
      lastName: gkPms.lastName,
      headshotUrl: gkPms.headshotUrl,
    })
    .from(gkPms)
    .where(eq(gkPms.agencyId, site.agencyId));

  const existing = await db
    .select({
      pmId: gkHeadshotMatches.pmId,
    })
    .from(gkHeadshotMatches)
    .where(eq(gkHeadshotMatches.agencyWebsiteId, site.websiteId));
  const existingPmIds = new Set(existing.map((e) => e.pmId));

  await db
    .delete(gkExtractionMisses)
    .where(eq(gkExtractionMisses.agencyWebsiteId, site.websiteId));

  let missSamplesStored = 0;

  const validPeople = people.filter(
    (p) =>
      isPlausibleImageUrl(p.imageUrl) &&
      !!resolveUrl(site.teamPageUrl, p.imageUrl),
  );
  extracted = validPeople.length;

  for (const person of validPeople) {
    const resolvedImage = resolveUrl(site.teamPageUrl, person.imageUrl);
    if (!resolvedImage) continue;

    let best: {
      pmId: string;
      confidence: "exact" | "fuzzy" | "uncertain";
      score: number;
    } | null = null;
    for (const pm of pms) {
      if (existingPmIds.has(pm.id)) continue;
      const result = scoreNameMatch(person.name, pm.firstName, pm.lastName);
      if (!result) continue;
      if (!best || result.score > best.score) {
        best = {
          pmId: pm.id,
          confidence: result.confidence,
          score: result.score,
        };
      }
      if (best.confidence === "exact" && best.score === 1) break;
    }

    if (!best) {
      if (missSamplesStored < MAX_MISS_SAMPLES) {
        await db.insert(gkExtractionMisses).values({
          agencyWebsiteId: site.websiteId,
          scrapedName: person.name,
          pmCandidates: pms.map((pm) => ({
            firstName: pm.firstName,
            lastName: pm.lastName,
          })),
        });
        missSamplesStored++;
      }
      continue;
    }
    if (existingPmIds.has(best.pmId)) {
      duplicatesSkipped++;
      continue;
    }

    const [inserted] = await db
      .insert(gkHeadshotMatches)
      .values({
        pmId: best.pmId,
        agencyWebsiteId: site.websiteId,
        scrapedName: person.name,
        scrapedImageUrl: resolvedImage,
        confidence: best.confidence,
        matchScore: best.score.toString(),
        status: "pending_review",
      })
      .returning({ id: gkHeadshotMatches.id });

    const image = await downloadImage(resolvedImage);
    if (image) {
      const storagePath = `headshots/staging/${inserted.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("growth-kit-assets")
        .upload(storagePath, image.buffer, {
          contentType: image.contentType,
          upsert: true,
        });
      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage
          .from("growth-kit-assets")
          .getPublicUrl(storagePath);
        await db
          .update(gkHeadshotMatches)
          .set({ storedImageUrl: publicUrl })
          .where(eq(gkHeadshotMatches.id, inserted.id));
      } else {
        errors.push(
          `${site.agencyName} — ${person.name}: upload failed: ${uploadError.message}`,
        );
      }
    }

    existingPmIds.add(best.pmId);
    matched++;
  }

  await db
    .update(gkAgencyWebsites)
    .set({
      extractedCount: extracted,
      matchedCount: matched,
    })
    .where(eq(gkAgencyWebsites.id, site.websiteId));

  return { extracted, matched, duplicatesSkipped, errors };
}
