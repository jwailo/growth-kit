import { db } from "@/db";
import { gkAgencies, gkPms } from "@/db/schema/tile-engine";
import {
  gkAgencyWebsites,
  gkHeadshotMatches,
} from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import {
  CLAUDE_MODEL,
  extractJson,
  getAnthropic,
  getFirecrawl,
  sleep,
} from "@/lib/headshot-finder/clients";
import { scoreNameMatch } from "@/lib/headshot-finder/matching";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 800;

const DELAY_MS = 3000;
const MAX_HTML_CHARS = 180000;

type WebsiteRow = {
  id: string;
  agencyId: string;
  agencyName: string;
  teamPageUrl: string;
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

export async function POST() {
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
      teamPageUrl: gkAgencyWebsites.teamPageUrl,
    })
    .from(gkAgencyWebsites)
    .innerJoin(gkAgencies, eq(gkAgencies.id, gkAgencyWebsites.agencyId))
    .where(eq(gkAgencyWebsites.scrapeStatus, "scraped"));

  const candidates: WebsiteRow[] = rows
    .filter(
      (r): r is typeof r & { teamPageUrl: string } =>
        typeof r.teamPageUrl === "string" && r.teamPageUrl.length > 0,
    )
    .map((r) => ({
      id: r.id,
      agencyId: r.agencyId,
      agencyName: r.agencyName,
      teamPageUrl: r.teamPageUrl,
    }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      send({ type: "start", total: candidates.length });

      if (candidates.length === 0) {
        send({
          type: "done",
          total: 0,
          matchesCreated: 0,
          duplicatesSkipped: 0,
          agenciesProcessed: 0,
          agenciesErrored: 0,
          errors: [],
          summary: "No scraped team pages to extract from.",
        });
        controller.close();
        return;
      }

      const firecrawl = getFirecrawl();
      let matchesCreated = 0;
      let duplicatesSkipped = 0;
      let agenciesProcessed = 0;
      let agenciesErrored = 0;
      const errors: string[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const site = candidates[i];
        send({
          type: "progress",
          current: i + 1,
          total: candidates.length,
          agency: site.agencyName,
        });

        let agencyMatches = 0;
        try {
          const scrape = await firecrawl.scrape(site.teamPageUrl, {
            formats: ["html"],
            onlyMainContent: false,
          });
          const html = scrape.html ?? scrape.rawHtml ?? "";
          if (!html) {
            errors.push(`${site.agencyName}: empty scrape`);
            agenciesErrored++;
            send({
              type: "result",
              agency: site.agencyName,
              outcome: "error",
              error: "empty scrape",
              current: i + 1,
              total: candidates.length,
              matchesCreated,
              duplicatesSkipped,
              agenciesProcessed,
              agenciesErrored,
              errorCount: errors.length,
            });
            if (i < candidates.length - 1) await sleep(DELAY_MS);
            continue;
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
              agencyWebsiteId: gkHeadshotMatches.agencyWebsiteId,
            })
            .from(gkHeadshotMatches)
            .where(eq(gkHeadshotMatches.agencyWebsiteId, site.id));
          const existingPmIds = new Set(existing.map((e) => e.pmId));

          for (const person of people) {
            if (!isPlausibleImageUrl(person.imageUrl)) continue;
            const resolvedImage = resolveUrl(site.teamPageUrl, person.imageUrl);
            if (!resolvedImage) continue;

            let best: {
              pmId: string;
              confidence: "exact" | "fuzzy" | "uncertain";
              score: number;
            } | null = null;
            for (const pm of pms) {
              if (existingPmIds.has(pm.id)) continue;
              const result = scoreNameMatch(
                person.name,
                pm.firstName,
                pm.lastName,
              );
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

            if (!best) continue;
            if (existingPmIds.has(best.pmId)) {
              duplicatesSkipped++;
              continue;
            }

            const [inserted] = await db
              .insert(gkHeadshotMatches)
              .values({
                pmId: best.pmId,
                agencyWebsiteId: site.id,
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
            matchesCreated++;
            agencyMatches++;
          }

          agenciesProcessed++;
          send({
            type: "result",
            agency: site.agencyName,
            outcome: "processed",
            agencyMatches,
            current: i + 1,
            total: candidates.length,
            matchesCreated,
            duplicatesSkipped,
            agenciesProcessed,
            agenciesErrored,
            errorCount: errors.length,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${site.agencyName}: ${message}`);
          agenciesErrored++;
          send({
            type: "result",
            agency: site.agencyName,
            outcome: "error",
            error: message,
            current: i + 1,
            total: candidates.length,
            matchesCreated,
            duplicatesSkipped,
            agenciesProcessed,
            agenciesErrored,
            errorCount: errors.length,
          });
        }

        if (i < candidates.length - 1) await sleep(DELAY_MS);
      }

      send({
        type: "done",
        total: candidates.length,
        matchesCreated,
        duplicatesSkipped,
        agenciesProcessed,
        agenciesErrored,
        errors,
        summary: `Processed ${agenciesProcessed} agencies: ${matchesCreated} matches created, ${duplicatesSkipped} duplicates skipped, ${agenciesErrored} errored.`,
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
