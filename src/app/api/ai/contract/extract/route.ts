import { NextRequest, NextResponse } from "next/server";
import type { ChatImage } from "@/lib/ai";
import { AIError } from "@/lib/ai";
import { extractContractFromImages, extractContractFromText } from "@/lib/contract-extract";
import { getLocale } from "@/lib/i18n/locale-server";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json();
  const images = body.images as ChatImage[] | undefined;
  const text = String(body.text ?? "").trim();
  const customerNameHint = String(body.customerNameHint ?? "").trim() || null;

  const hasImages = Array.isArray(images) && images.length > 0;
  if (!hasImages && !text) {
    return NextResponse.json(
      { error: "请上传 CRM 合同截图或粘贴文字" },
      { status: 400 }
    );
  }

  const locale = await getLocale();
  const ctx = { locale, userId: uid, customerNameHint };

  try {
    const result = hasImages
      ? await extractContractFromImages(images!, ctx)
      : await extractContractFromText(text, ctx);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg =
      e instanceof AIError ? e.message : `识别失败: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
