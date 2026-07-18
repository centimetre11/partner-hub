import { NextRequest, NextResponse } from "next/server";
import type { ChatImage } from "@/lib/ai";
import { AIError } from "@/lib/ai";
import { extractMeetingFromImages, extractMeetingFromText } from "@/lib/meeting-extract";
import { toDateTimeLocalInput } from "@/lib/meeting-datetime";
import { getLocale } from "@/lib/i18n/locale-server";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const images = body.images as ChatImage[] | undefined;
  const text = String(body.text ?? "").trim();
  const timeZone = String(body.timeZone ?? "UTC").trim() || "UTC";
  const nowLocal =
    String(body.nowLocal ?? "").trim() ||
    toDateTimeLocalInput(new Date(), timeZone);
  const weekday =
    String(body.weekday ?? "").trim() ||
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(new Date());

  const hasImages = Array.isArray(images) && images.length > 0;
  if (!hasImages && !text) {
    return NextResponse.json({ error: "请上传截图或输入会议邀约文字" }, { status: 400 });
  }

  const locale = await getLocale();
  const ctx = { locale, timeZone, nowLocal, weekday, userId: uid };

  try {
    const result = hasImages
      ? await extractMeetingFromImages(images!, ctx)
      : await extractMeetingFromText(text, ctx);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `识别失败: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
