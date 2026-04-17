import { db } from "@/db";
import {
  gkAgencies,
  gkPms,
  gkTileRuns,
  gkTileRecords,
} from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq, and, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 60;

type MappedRow = {
  firstName: string;
  lastName: string;
  agencyName: string;
  responseTimeMins: number;
  email?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { rows, period }: { rows: MappedRow[]; period: string } = body;

  // Server-side validation — non-blocking: skip invalid rows, warn on issues
  const validRows: MappedRow[] = [];
  const skipped: { row: number; name: string; reasons: string[] }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const reasons: string[] = [];
    const name = `${row.firstName || ""} ${row.lastName || ""}`.trim() || `(row ${i + 1})`;

    if (!row.firstName || !row.lastName || !row.agencyName) {
      reasons.push("missing required fields (firstName, lastName, or agencyName)");
    }
    if (row.responseTimeMins < 0.5) {
      reasons.push(`response time too low: ${row.responseTimeMins} min (min 0.5)`);
    }
    if (row.responseTimeMins >= 60) {
      reasons.push(`response time too high: ${row.responseTimeMins} min (max 59.9)`);
    }
    const key = `${(row.firstName || "").toLowerCase()}-${(row.lastName || "").toLowerCase()}`;
    if (seen.has(key)) {
      reasons.push("duplicate PM name in this batch");
    }
    seen.add(key);

    if (reasons.length > 0) {
      console.warn(`[tile-engine/ingest] Skipping row ${i + 1} (${name}): ${reasons.join("; ")}`);
      skipped.push({ row: i + 1, name, reasons });
    } else {
      validRows.push(row);
    }
  }

  if (validRows.length === 0) {
    console.error(`[tile-engine/ingest] All ${rows.length} rows failed validation`);
    return NextResponse.json(
      {
        error: "All rows failed validation",
        skipped,
      },
      { status: 400 }
    );
  }

  if (skipped.length > 0) {
    console.warn(
      `[tile-engine/ingest] ${skipped.length} of ${rows.length} rows skipped, proceeding with ${validRows.length}`
    );
  }

  // Process rows in a pseudo-transaction approach
  let matchedCount = 0;
  let newPmCount = 0;
  let newAgencyCount = 0;
  let missingAssetsCount = 0;

  // Cache agencies by name to avoid repeated lookups
  const agencyCache = new Map<string, { id: string; name: string }>();
  const existingAgencies = await db.select().from(gkAgencies);
  for (const a of existingAgencies) {
    agencyCache.set(a.name.toLowerCase(), { id: a.id, name: a.name });
  }

  // Process each row: match/create agency, match/create PM
  const processedRows: {
    pmId: string;
    agencyName: string;
    responseTimeMins: number;
  }[] = [];

  for (const row of validRows) {
    // Match or create agency
    let agency = agencyCache.get(row.agencyName.toLowerCase());
    if (!agency) {
      const [newAgency] = await db
        .insert(gkAgencies)
        .values({ name: row.agencyName })
        .returning();
      agency = { id: newAgency.id, name: newAgency.name };
      agencyCache.set(row.agencyName.toLowerCase(), agency);
      newAgencyCount++;
    }

    // Match or create PM
    const existingPms = await db
      .select()
      .from(gkPms)
      .where(
        and(
          ilike(gkPms.firstName, row.firstName),
          ilike(gkPms.lastName, row.lastName)
        )
      );

    let pmId: string;
    let headshotUrl: string | null;

    if (existingPms.length > 0) {
      pmId = existingPms[0].id;
      headshotUrl = existingPms[0].headshotUrl;
      matchedCount++;

      // Update email if provided and not already set
      if (row.email && !existingPms[0].email) {
        await db
          .update(gkPms)
          .set({ email: row.email, updatedAt: new Date() })
          .where(eq(gkPms.id, pmId));
      }
    } else {
      const [newPm] = await db
        .insert(gkPms)
        .values({
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email || null,
          agencyId: agency.id,
        })
        .returning();
      pmId = newPm.id;
      headshotUrl = null;
      newPmCount++;
    }

    // Track missing assets for informational purposes only — not blocking
    const agencyRecord = await db
      .select()
      .from(gkAgencies)
      .where(eq(gkAgencies.id, agency.id));
    const hasAgencyLogo = !!agencyRecord[0]?.logoUrl;
    if (!headshotUrl || !hasAgencyLogo) missingAssetsCount++;

    processedRows.push({
      pmId,
      agencyName: agency.name,
      responseTimeMins: row.responseTimeMins,
    });
  }

  // Create the run
  const [run] = await db
    .insert(gkTileRuns)
    .values({
      period,
      status: "complete",
      totalPms: validRows.length,
      tilesGenerated: 0,
      missingAssets: missingAssetsCount,
      createdBy: user.email ?? "unknown",
    })
    .returning();

  // Create tile records
  for (const row of processedRows) {
    await db.insert(gkTileRecords).values({
      runId: run.id,
      pmId: row.pmId,
      agencyName: row.agencyName,
      responseTimeMins: String(row.responseTimeMins),
      status: "pending",
    });
  }

  console.log(
    `[tile-engine/ingest] Run ${run.id} created: ${validRows.length} PMs processed, ${skipped.length} skipped`
  );

    return NextResponse.json({
      runId: run.id,
      skipped: skipped.length > 0 ? skipped : undefined,
      summary: {
        totalPms: validRows.length,
        matchedPms: matchedCount,
        newPms: newPmCount,
        newAgencies: newAgencyCount,
        missingAssets: missingAssetsCount,
      },
    });
  } catch (err) {
    console.error("[tile-engine/ingest] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
