import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { saveUploadedFile } from "@/lib/assets";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  try {
    const asset = await saveUploadedFile(file, uid);
    return NextResponse.json({ asset: { id: asset.id, filename: asset.filename, mimeType: asset.mimeType, size: asset.size } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
