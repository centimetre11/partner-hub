/**
 * AI 图片框架（服务端）
 * chatCompletion 入口统一校验，防止未压缩的大 base64 导致请求失败或超时
 */

import { AIError, type ChatImage, type ChatMessage } from "@/lib/ai";
import { AI_IMAGE_MAX_DATA_URL_BYTES } from "@/lib/ai-image-config";

export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.floor((b64.length * 3) / 4);
}

export function validateChatImagesForAi(images: ChatImage[]): void {
  for (const img of images) {
    if (!img.url.startsWith("data:")) continue;
    const bytes = estimateDataUrlBytes(img.url);
    if (bytes > AI_IMAGE_MAX_DATA_URL_BYTES) {
      throw new AIError(
        `图片过大（约 ${Math.round(bytes / 1024)}KB，上限 ${Math.round(AI_IMAGE_MAX_DATA_URL_BYTES / 1024)}KB）。请刷新页面后重新粘贴/上传，系统会自动压缩。`,
      );
    }
  }
}

/** 发往大模型前校验消息中的图片体积 */
export function normalizeMessagesForAi(messages: ChatMessage[]): ChatMessage[] {
  for (const m of messages) {
    if (m.images?.length) validateChatImagesForAi(m.images);
  }
  return messages;
}
