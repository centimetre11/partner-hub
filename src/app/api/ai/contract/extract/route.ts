import { NextRequest, NextResponse } from "next/server";
import type { ChatImage } from "@/lib/ai";
import { AIError } from "@/lib/ai";
import { extractContractFromImages, extractContractFromText } from "@/lib/contract-extract";
import { estimateDataUrlBytes } from "@/lib/ai-images-server";
import { getLocale } from "@/lib/i18n/locale-server";
import { getSessionUserId } from "@/lib/session";

export const maxDuration = 120;

/** Soft cap before calling the model — keeps Node from resetting on huge payloads. */
const MAX_IMAGE_BYTES = 900_000;

export async function POST(req: NextRequest) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

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

    if (hasImages) {
      for (const img of images!) {
        if (!img?.url?.startsWith("data:")) continue;
        const bytes = estimateDataUrlBytes(img.url);
        if (bytes > MAX_IMAGE_BYTES) {
          return NextResponse.json(
            {
              error: `截图过大（约 ${Math.round(bytes / 1024)}KB）。请裁剪主要字段区域后重试。`,
            },
            { status: 413 }
          );
        }
      }
    }

    const locale = await getLocale();
    const ctx = { locale, userId: uid, customerNameHint };

    const result = hasImages
      ? await extractContractFromImages(images!, ctx)
      : await extractContractFromText(text, ctx);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg =
      e instanceof AIError
        ? e.message
        : `识别失败: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[contract/extract]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
