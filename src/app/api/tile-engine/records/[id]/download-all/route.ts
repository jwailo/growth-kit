import { db } from "@/db";
import { gkTileRecords, gkPms } from "@/db/schema/tile-engine";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import JSZip from "jszip";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const [row] = await db
      .select({
        tileUrlSquare: gkTileRecords.tileUrlSquare,
        tileUrlSquareNamed: gkTileRecords.tileUrlSquareNamed,
        tileUrlIg: gkTileRecords.tileUrlIg,
        tileUrlIgNamed: gkTileRecords.tileUrlIgNamed,
        pmFirstName: gkPms.firstName,
        pmLastName: gkPms.lastName,
      })
      .from(gkTileRecords)
      .innerJoin(gkPms, eq(gkTileRecords.pmId, gkPms.id))
      .where(eq(gkTileRecords.id, id));

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const slug = `${row.pmFirstName}-${row.pmLastName}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-");

    const variants: Array<{ url: string | null; name: string }> = [
      { url: row.tileUrlSquare, name: `${slug}-square.png` },
      { url: row.tileUrlSquareNamed, name: `${slug}-square-named.png` },
      { url: row.tileUrlIg, name: `${slug}-instagram.png` },
      { url: row.tileUrlIgNamed, name: `${slug}-instagram-named.png` },
    ];

    const zip = new JSZip();
    let added = 0;
    for (const { url, name } of variants) {
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      zip.file(name, buf);
      added++;
    }

    if (added === 0) {
      return NextResponse.json(
        { error: "No tile images available" },
        { status: 404 },
      );
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-response-time-tiles.zip"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[tile-engine/records/[id]/download-all] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
