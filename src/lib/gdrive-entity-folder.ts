import { resolveClientMaterialsFolderId, resolveGdriveServiceAccountJson } from "./ammo-config";
import { listGdriveFolderContents, parseGdriveFolderId } from "./google-drive";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function folderUrlFromId(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

export function findFolderByName(folders: { id: string; name: string }[], entityName: string) {
  const target = normalizeName(entityName);
  return folders.find((f) => normalizeName(f.name) === target) ?? null;
}

/** 在 07_Client Information 下按名称匹配客户或伙伴子目录（服务账号只读列表） */
export async function resolveEntityGdriveFolder(
  entityName: string,
): Promise<{ folderId: string; folderUrl: string } | null> {
  const parentId = await resolveClientMaterialsFolderId();
  if (!parentId) return null;

  const saJson = await resolveGdriveServiceAccountJson();
  if (!saJson) return null;

  const { folders } = await listGdriveFolderContents(parentId, saJson);
  const matched = findFolderByName(folders, entityName);
  if (!matched) return null;

  return { folderId: matched.id, folderUrl: folderUrlFromId(matched.id) };
}

export function parseFolderIdFromUrl(url: string): string | null {
  return parseGdriveFolderId(url);
}
