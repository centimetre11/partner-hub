import { resolveGdriveFolderId } from "./ammo-config";
import { listGdriveSubfoldersOauth, parseGdriveFolderId } from "./google-drive";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function folderUrlFromId(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

function findFolderByName(folders: { id: string; name: string }[], entityName: string) {
  const target = normalizeName(entityName);
  return folders.find((f) => normalizeName(f.name) === target) ?? null;
}

function isClientInfoFolder(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("client") && (n.includes("infomation") || n.includes("information"));
}

/** 在弹药库根目录 / 07_Client Information 下按名称匹配客户或伙伴子目录 */
export async function resolveEntityGdriveFolder(
  entityName: string,
  accessToken: string,
): Promise<{ folderId: string; folderUrl: string } | null> {
  const rootId = await resolveGdriveFolderId();
  if (!rootId) return null;

  const rootFolders = await listGdriveSubfoldersOauth(rootId, accessToken);

  const direct = findFolderByName(rootFolders, entityName);
  if (direct) {
    return { folderId: direct.id, folderUrl: folderUrlFromId(direct.id) };
  }

  const clientInfo =
    rootFolders.find((f) => isClientInfoFolder(f.name)) ??
    rootFolders.find((f) => /^07_/i.test(f.name));

  if (!clientInfo) return null;

  const clientChildren = await listGdriveSubfoldersOauth(clientInfo.id, accessToken);
  const matched = findFolderByName(clientChildren, entityName);
  if (!matched) return null;

  return { folderId: matched.id, folderUrl: folderUrlFromId(matched.id) };
}

export function parseFolderIdFromUrl(url: string): string | null {
  return parseGdriveFolderId(url);
}
