import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { saveLinkAsset } from "@/lib/link-assets";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let url = "";
  try {
    const body = await req.json();
    url = String(body?.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  try {
    const { asset, preview } = await saveLinkAsset(url, uid);
    return NextResponse.json({
      asset: {
        id: asset.id,
        kind: asset.kind,
        filename: asset.filename,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        provider: asset.provider,
        description: preview.description,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
