import { db } from "@/db";
import { gkAgencies } from "@/db/schema/tile-engine";
import { gkAgencyWebsites } from "@/db/schema/headshot-finder";
import { createClient } from "@/lib/supabase/server";
import { sleep } from "@/lib/headshot-finder/clients";
import { extractAndMatchSite } from "@/lib/headshot-finder/extract";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 800;

const DELAY_MS = 3000;

type WebsiteRow = {
  id: string;
  agencyId: string;
  agencyName: string;
  teamPageUrl: string;
};

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

        try {
          const result = await extractAndMatchSite(supabase, {
            websiteId: site.id,
            agencyId: site.agencyId,
            agencyName: site.agencyName,
            teamPageUrl: site.teamPageUrl,
          });
          matchesCreated += result.matched;
          duplicatesSkipped += result.duplicatesSkipped;
          errors.push(...result.errors);
          agenciesProcessed++;
          send({
            type: "result",
            agency: site.agencyName,
            outcome: "processed",
            agencyMatches: result.matched,
            agencyExtracted: result.extracted,
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
