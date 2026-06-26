import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** 文件已改为浏览器直传 Google；此端点仅保留兼容提示。 */
export async function POST() {
  return NextResponse.json(
    { error: "Upload moved to client direct upload — call /api/upload/gdrive/init first" },
    { status: 400 },
  );
}
