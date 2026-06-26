import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { db } from "./db";

const ALLOWED_EXT = new Set([
  ".pdf", ".ppt", ".pptx", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".md", ".txt",
]);

export function uploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

export function maxUploadMb() {
  const parsed = parseInt(process.env.MAX_UPLOAD_MB || "500", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

export function maxUploadBytes() {
  return maxUploadMb() * 1024 * 1024;
}

export function isAllowedFile(filename: string, mimeType: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ALLOWED_EXT.has(ext)) return true;
  if (mimeType.startsWith("image/")) return true;
  if (mimeType === "application/pdf") return true;
  if (mimeType.includes("presentation") || mimeType.includes("word")) return true;
  return false;
}

export async function saveUploadedFile(file: File, userId: string | null) {
  if (!isAllowedFile(file.name, file.type || "")) {
    throw new Error("Unsupported file type");
  }
  if (file.size > maxUploadBytes()) {
    throw new Error(`File exceeds ${maxUploadMb()}MB limit`);
  }
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-()+\u4e00-\u9fff]/g, "_");
  const storageKey = `${id}_${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, storageKey), buf);
  return db.asset.create({
    data: {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storageKey,
      uploadedById: userId,
    },
  });
}

export async function readAssetFile(assetId: string) {
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.kind === "LINK" || !asset.storageKey) {
    throw new Error("LINK assets have no local file");
  }
  const data = await readFile(path.join(uploadDir(), asset.storageKey));
  return { asset, data };
}
