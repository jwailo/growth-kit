import { db } from "@/db";
import { gkEmailEvents, gkTileRecords } from "@/db/schema/tile-engine";
import { and, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

export const maxDuration = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PIXEL_BYTES = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixelResponse(): NextResponse {
  return new NextResponse(new Uint8Array(PIXEL_BYTES), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_BYTES.length),
      "Cache-Control": "no-cache, no-store, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
) {
  try {
    const { recordId } = await params;
    if (!UUID_RE.test(recordId)) return pixelResponse();

    const [record] = await db
      .select({ id: gkTileRecords.id, pmId: gkTileRecords.pmId })
      .from(gkTileRecords)
      .where(eq(gkTileRecords.id, recordId));

    if (!record) return pixelResponse();

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ id: gkEmailEvents.id })
      .from(gkEmailEvents)
      .where(
        and(
          eq(gkEmailEvents.pmId, record.pmId),
          eq(gkEmailEvents.eventType, "open"),
          gte(gkEmailEvents.createdAt, cutoff),
        ),
      )
      .limit(1);

    if (!recent) {
      await db.insert(gkEmailEvents).values({
        tileRecordId: record.id,
        pmId: record.pmId,
        eventType: "open",
        ipAddress: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      });
    }
  } catch (err) {
    console.error("[track/open] Error:", err);
  }
  return pixelResponse();
}
