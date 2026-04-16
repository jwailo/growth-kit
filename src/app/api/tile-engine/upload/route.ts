import { db } from "@/db";
import { gkPms, gkAgencies } from "@/db/schema/tile-engine";
import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const type = formData.get("type") as string; // "headshot" or "logo"
  const entityId = formData.get("entityId") as string;

  if (!file || !type || !entityId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const folder = type === "headshot" ? "headshots" : "logos";
  const ext = file.name.split(".").pop();
  const fileName = `${folder}/${entityId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("growth-kit-assets")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("growth-kit-assets").getPublicUrl(fileName);

  // Update the DB record with the URL
  if (type === "headshot") {
    await db
      .update(gkPms)
      .set({ headshotUrl: publicUrl, updatedAt: new Date() })
      .where(eq(gkPms.id, entityId));
  } else {
    await db
      .update(gkAgencies)
      .set({ logoUrl: publicUrl, updatedAt: new Date() })
      .where(eq(gkAgencies.id, entityId));
  }

  return NextResponse.json({ url: publicUrl });
}
