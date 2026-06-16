/** 浏览器端：上传 AI 前压缩图片，减小 base64 体积、加快 vision 请求 */

export type CompressedChatImage = { url: string; name: string };

const DEFAULT_MAX_SIDE = 1280;
const DEFAULT_QUALITY = 0.82;

function readFileAsDataUrl(file: File): Promise<CompressedChatImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ url: String(reader.result), name: file.name || "image.jpg" });
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/** 将图片缩放到 maxSide 以内并以 JPEG 压缩，失败时回退原图 */
export async function compressImageForAi(
  file: File,
  opts?: { maxSide?: number; quality?: number },
): Promise<CompressedChatImage> {
  if (!file.type.startsWith("image/") || typeof document === "undefined") {
    return readFileAsDataUrl(file);
  }

  const maxSide = opts?.maxSide ?? DEFAULT_MAX_SIDE;
  const quality = opts?.quality ?? DEFAULT_QUALITY;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxSide && file.size <= 300_000) {
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

export async function compressImagesForAi(files: File[]): Promise<CompressedChatImage[]> {
  const imgs = files.filter((f) => f.type.startsWith("image/"));
  return Promise.all(imgs.map((f) => compressImageForAi(f)));
}
