/**
 * AI 图片框架（客户端）
 *
 * 凡是要发给大模型做 vision/识图的图片，都应经本模块处理：
 *   prepareChatImagesFromFiles / prepareChatImageFromFile
 *
 * 已接入：AiWorkflowPanel（AI 加人、建档、助手对话等所有带图输入）
 * 服务端兜底：ai-images-server.ts 在 chatCompletion 入口校验体积
 */

import type { ChatImage } from "@/lib/ai";
import {
  AI_IMAGE_JPEG_QUALITY,
  AI_IMAGE_MAX_SIDE,
  AI_IMAGE_SKIP_COMPRESS_FILE_BYTES,
} from "@/lib/ai-image-config";

export { AI_IMAGE_JPEG_QUALITY, AI_IMAGE_MAX_DATA_URL_BYTES, AI_IMAGE_MAX_SIDE } from "@/lib/ai-image-config";

function readFileAsDataUrl(file: File): Promise<ChatImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ url: String(reader.result), name: file.name || "image.jpg" });
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/** 单张 File → 压缩后的 ChatImage（最长边 AI_IMAGE_MAX_SIDE，JPEG） */
export async function prepareChatImageFromFile(
  file: File,
  opts?: { maxSide?: number; quality?: number },
): Promise<ChatImage> {
  if (!file.type.startsWith("image/") || typeof document === "undefined") {
    return readFileAsDataUrl(file);
  }

  const maxSide = opts?.maxSide ?? AI_IMAGE_MAX_SIDE;
  const quality = opts?.quality ?? AI_IMAGE_JPEG_QUALITY;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxSide && file.size <= AI_IMAGE_SKIP_COMPRESS_FILE_BYTES) {
      bitmap.close();
      return readFileAsDataUrl(file);
    }

    const scale = Math.min(1, maxSide / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return readFileAsDataUrl(file);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    bitmap = null;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return readFileAsDataUrl(file);

    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("压缩后读取失败"));
      reader.readAsDataURL(blob);
    });

    const base = file.name?.replace(/\.[^.]+$/, "") || "image";
    return { url, name: `${base}.jpg` };
  } catch {
    bitmap?.close();
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

/** @deprecated 使用 prepareChatImagesFromFiles */
export const compressImagesForAi = prepareChatImagesFromFiles;
/** @deprecated 使用 prepareChatImageFromFile */
export const compressImageForAi = prepareChatImageFromFile;
