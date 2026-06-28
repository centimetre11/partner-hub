/**
 * AI 图片框架（客户端）
 *
 * 凡是要发给大模型做 vision/识图的图片，都应经本模块处理：
 *   prepareChatImagesFromFiles / prepareChatImageFromFile / ensureChatImagesWithinLimit
 *
 * 已接入：AiWorkflowPanel（AI 加人、建档、助手对话等所有带图输入）
 * 服务端兜底：ai-images-server.ts 在 chatCompletion 入口校验体积
 */

import type { ChatImage } from "@/lib/ai";
import {
  AI_IMAGE_JPEG_QUALITY,
  AI_IMAGE_MAX_DATA_URL_BYTES,
  AI_IMAGE_MAX_SIDE,
  AI_IMAGE_SKIP_COMPRESS_FILE_BYTES,
} from "@/lib/ai-image-config";

export {
  AI_IMAGE_JPEG_QUALITY,
  AI_IMAGE_MAX_DATA_URL_BYTES,
  AI_IMAGE_MAX_SIDE,
} from "@/lib/ai-image-config";

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.floor((b64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<ChatImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ url: String(reader.result), name: file.name || "image.jpg" });
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function canvasToChatImage(
  canvas: HTMLCanvasElement,
  name: string,
  quality: number,
): Promise<ChatImage | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return null;

  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read compressed image"));
    reader.readAsDataURL(blob);
  });

  const base = name?.replace(/\.[^.]+$/, "") || "image";
  return { url, name: `${base}.jpg` };
}

async function compressBitmapToChatImage(
  bitmap: ImageBitmap,
  name: string,
  maxSide: number,
  quality: number,
): Promise<ChatImage> {
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, maxSide / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.drawImage(bitmap, 0, 0, w, h);
  const out = await canvasToChatImage(canvas, name, quality);
  if (!out) throw new Error("Failed to compress image");
  return out;
}

async function compressFileToChatImage(
  file: File,
  maxSide: number,
  quality: number,
): Promise<ChatImage> {
  const bitmap = await createImageBitmap(file);
  try {
    return await compressBitmapToChatImage(bitmap, file.name || "image.jpg", maxSide, quality);
  } finally {
    bitmap.close();
  }
}

/** 单张 File → 压缩后的 ChatImage（最长边 AI_IMAGE_MAX_SIDE，JPEG；必要时继续缩小） */
export async function prepareChatImageFromFile(
  file: File,
  opts?: { maxSide?: number; quality?: number },
): Promise<ChatImage> {
  if (!file.type.startsWith("image/") || typeof document === "undefined") {
    return readFileAsDataUrl(file);
  }

  let maxSide = opts?.maxSide ?? AI_IMAGE_MAX_SIDE;
  let quality = opts?.quality ?? AI_IMAGE_JPEG_QUALITY;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const smallEnough =
      longest <= maxSide &&
      file.size <= AI_IMAGE_SKIP_COMPRESS_FILE_BYTES;
    bitmap.close();

    if (smallEnough) {
      const raw = await readFileAsDataUrl(file);
      if (estimateDataUrlBytes(raw.url) <= AI_IMAGE_MAX_DATA_URL_BYTES) return raw;
    }

    let result = await compressFileToChatImage(file, maxSide, quality);
    while (estimateDataUrlBytes(result.url) > AI_IMAGE_MAX_DATA_URL_BYTES && maxSide > 480) {
      maxSide = Math.max(480, Math.round(maxSide * 0.82));
      quality = Math.max(0.52, quality - 0.1);
      result = await compressFileToChatImage(file, maxSide, quality);
    }
    return result;
  } catch {
    return readFileAsDataUrl(file);
  }
}

/** 多选/粘贴/拖拽 FileList → ChatImage[]（AI 输入唯一入口） */
export async function prepareChatImagesFromFiles(
  files: File[] | FileList,
  opts?: { maxSide?: number; quality?: number },
): Promise<ChatImage[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
  return Promise.all(list.map((f) => prepareChatImageFromFile(f, opts)));
}

/** 发送前再次压到体积上限（含历史消息里已附带的 data URL 图片） */
export async function ensureChatImagesWithinLimit(images: ChatImage[]): Promise<ChatImage[]> {
  return Promise.all(
    images.map(async (img) => {
      if (!img.url.startsWith("data:")) return img;
      if (estimateDataUrlBytes(img.url) <= AI_IMAGE_MAX_DATA_URL_BYTES) return img;
      try {
        const blob = await fetch(img.url).then((r) => r.blob());
        const file = new File([blob], img.name ?? "image.jpg", {
          type: blob.type.startsWith("image/") ? blob.type : "image/jpeg",
        });
        return prepareChatImageFromFile(file);
      } catch {
        return img;
      }
    }),
  );
}

/** @deprecated 使用 prepareChatImagesFromFiles */
export const compressImagesForAi = prepareChatImagesFromFiles;
/** @deprecated 使用 prepareChatImageFromFile */
export const compressImageForAi = prepareChatImageFromFile;
