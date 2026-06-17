import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { readAssetFile } from "@/lib/assets";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const linkAsset = await db.asset.findUnique({ where: { id } });
  if (linkAsset?.kind === "LINK" && linkAsset.url) {
    return NextResponse.redirect(linkAsset.url);
  }
  try {
    const { asset, data } = await readAssetFile(id);
    return new NextResponse(data, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
