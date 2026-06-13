import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { readAssetFile } from "@/lib/assets";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  try {
    const { asset, data } = await readAssetFile(id);
    return new NextResponse(data, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.filename)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
