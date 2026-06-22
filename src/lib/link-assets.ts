import { db } from "./db";
import { fetchLinkPreview, type LinkPreview } from "./link-preview";
import { fetchKmsPageFromUrl, resolveKmsCredential } from "./kms";
import { fetchGdriveFileById, parseGdriveFileId } from "./google-drive";
import { resolveGdriveServiceAccountJson } from "./ammo-config";

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
