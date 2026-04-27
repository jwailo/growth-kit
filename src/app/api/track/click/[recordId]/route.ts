import { db } from "@/db";
import { gkEmailEvents, gkTileRecords } from "@/db/schema/tile-engine";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_LINK_NAMES = new Set([
  "tile_square_named",
  "tile_ig",
  "tile_ig_named",
  "download_all",
  "unsubscribe",
]);

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  const { recordId } = await params;
  const url = new URL(request.url);
  const destination = url.searchParams.get("url");
  const linkParam = url.searchParams.get("link");

  if (!destination || !isSafeUrl(destination)) {
    return NextResponse.json(
      { error: "Missing or invalid destination url" },
      { status: 400 },
    );
  }

  const linkName =
    linkParam && ALLOWED_LINK_NAMES.has(linkParam) ? linkParam : null;

  if (UUID_RE.test(recordId)) {
    try {
      const [record] = await db
        .select({ id: gkTileRecords.id, pmId: gkTileRecords.pmId })
        .from(gkTileRecords)
        .where(eq(gkTileRecords.id, recordId));

      if (record) {
        await db.insert(gkEmailEvents).values({
          tileRecordId: record.id,
          pmId: record.pmId,
          eventType: "click",
          linkName,
          destinationUrl: destination,
          ipAddress: clientIp(request),
          userAgent: request.headers.get("user-agent"),
        });
      }
    } catch (err) {
      console.error("[track/click] Error logging click:", err);
    }
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
