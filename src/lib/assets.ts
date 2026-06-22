import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { db } from "./db";
import { fetchLinkPreview, type LinkPreview } from "./link-preview";
import { fetchKmsPageFromUrl, resolveKmsCredential } from "./kms";
import { fetchGdriveFileById, parseGdriveFileId } from "./google-drive";
import { resolveGdriveServiceAccountJson } from "./ammo-config";

/** 联合方案默认 Google Drive 上传目录 */
export const SOLUTION_GDRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/167rUvv3r0lo17tSW6zfX53a4WewFV22J";

export async function previewLinkUrl(rawUrl: string, userId: string | null): Promise<LinkPreview> {
  const url = rawUrl.trim();
  if (!url) throw new Error("URL cannot be empty");
  const preview = await fetchLinkPreview(url);

  if (preview.provider === "kms" && userId) {
    const cred = await resolveKmsCredential(userId);
    if (cred) {
      try {
        const page = await fetchKmsPageFromUrl({
          baseUrl: cred.baseUrl,
          token: cred.accessToken,
          url: preview.url,
        });
        if (page.title) preview.title = page.title;
        if (page.plainText) {
          preview.description = page.plainText.replace(/\s+/g, " ").trim().slice(0, 500);
        }
      } catch {
        // 无权限或页面不存在时保留 OG 回退
      }
    }
  }

  if (preview.provider === "gdrive") {
    const fileId = parseGdriveFileId(url);
    const saJson = await resolveGdriveServiceAccountJson();
    if (fileId && saJson) {
      try {
        const file = await fetchGdriveFileById(fileId, saJson);
        if (file?.name) preview.title = file.name;
        if (file?.thumbnailLink) preview.thumbnailUrl = file.thumbnailLink;
      } catch {
        // 服务账号无权限时保留 OG / thumbnail 接口回退
      }
    }
  }

  return preview;
}

const ALLOWED_EXT = new Set([
  ".pdf", ".ppt", ".pptx", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".md", ".txt",
]);

export function uploadDir() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}

export function maxUploadBytes() {
  const mb = parseInt(process.env.MAX_UPLOAD_MB || "20", 10);
  return mb * 1024 * 1024;
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
    throw new Error(`File exceeds ${process.env.MAX_UPLOAD_MB || 20}MB limit`);
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

export async function saveLinkAsset(rawUrl: string, userId: string | null) {
  const url = rawUrl.trim();
  if (!url) throw new Error("URL cannot be empty");
  const preview = await previewLinkUrl(url, userId);

  const asset = await db.asset.create({
    data: {
      kind: "LINK",
      filename: preview.title || preview.url,
      mimeType: "text/uri-list",
      size: 0,
      url: preview.url,
      thumbnailUrl: preview.thumbnailUrl,
      provider: preview.provider,
      uploadedById: userId,
    },
  });

  return { asset, preview };
}

export async function readAssetFile(assetId: string) {
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.kind === "LINK" || !asset.storageKey) {
    throw new Error("LINK assets have no local file");
  }
  const data = await readFile(path.join(uploadDir(), asset.storageKey));
  return { asset, data };
}
