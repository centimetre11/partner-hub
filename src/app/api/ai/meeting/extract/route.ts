import { NextRequest, NextResponse } from "next/server";
import type { ChatImage } from "@/lib/ai";
import { AIError } from "@/lib/ai";
import { extractMeetingFromImages } from "@/lib/meeting-extract";
import { getLocale } from "@/lib/i18n/locale-server";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const images = body.images as ChatImage[] | undefined;
  const timeZone = String(body.timeZone ?? "UTC").trim() || "UTC";

  if (!Array.isArray(images) || !images.length) {
    return NextResponse.json({ error: "请上传截图" }, { status: 400 });
  }

  const locale = await getLocale();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const result = await extractMeetingFromImages(images, {
      locale,
      timeZone,
      today,
      userId: uid,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `识别失败: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
