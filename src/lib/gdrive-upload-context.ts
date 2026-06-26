import { db } from "@/lib/db";
import { parseGdriveFolderId } from "@/lib/google-drive";
import { getUploaderAccessToken } from "@/lib/google-oauth";
import { resolveEntityGdriveFolder } from "@/lib/gdrive-entity-folder";

export type GdriveUploadTarget =
  | {
      ok: true;
      folderId: string;
      folderUrl: string;
      autoResolvedFolderUrl: string | null;
      accessToken: string;
    }
  | { ok: false; error: string; code?: string };

/** 解析上传目标文件夹并换取 OAuth access token（供浏览器直传 Google 初始化用） */
export async function resolveGdriveUploadTarget(
  partnerId: string | null,
  customerId: string | null,
  folderUrlOverride: string | null,
): Promise<GdriveUploadTarget> {
  let entityName: string | null = null;
  let folderUrl = folderUrlOverride;
  if (!folderUrl && partnerId) {
    const p = await db.partner.findUnique({
      where: { id: partnerId },
      select: { gdriveFolderUrl: true, name: true },
    });
    folderUrl = p?.gdriveFolderUrl?.trim() || null;
    entityName = p?.name ?? null;
  }
  if (!folderUrl && customerId) {
    const c = await db.customer.findUnique({
      where: { id: customerId },
      select: { gdriveFolderUrl: true, name: true },
    });
    folderUrl = c?.gdriveFolderUrl?.trim() || null;
    entityName = c?.name ?? null;
  }

  let autoResolvedFolderUrl: string | null = null;

  try {
    const accessToken = await getUploaderAccessToken();

    if (!folderUrl && entityName) {
      const resolved = await resolveEntityGdriveFolder(entityName);
      if (resolved) {
        folderUrl = resolved.folderUrl;
        autoResolvedFolderUrl = resolved.folderUrl;
        if (partnerId) {
          await db.partner.update({
            where: { id: partnerId },
            data: { gdriveFolderUrl: resolved.folderUrl },
          });
        } else if (customerId) {
          await db.customer.update({
            where: { id: customerId },
            data: { gdriveFolderUrl: resolved.folderUrl },
          });
        }
      }
    }

    if (!folderUrl) {
      return {
        ok: false,
        code: "FOLDER_NOT_FOUND",
        error: entityName
          ? `未找到与「${entityName}」同名的 Drive 子目录。请在下方粘贴目录链接并保存，或在 07_Client Information 下创建同名文件夹后重试。`
          : "No Google Drive folder bound for this record — bind one first",
      };
    }

    const folderId = parseGdriveFolderId(folderUrl);
    if (!folderId) {
      return { ok: false, error: "Invalid Google Drive folder URL" };
    }

    return {
      ok: true,
      folderId,
      folderUrl,
      autoResolvedFolderUrl,
      accessToken,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
