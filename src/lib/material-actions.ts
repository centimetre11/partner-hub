"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import {
  createGdriveFolderOauth,
  listGdriveFolderContents,
  parseGdriveFolderId,
} from "./google-drive";
import { folderUrlFromId, findFolderByName } from "./gdrive-entity-folder";
import {
  resolveClientMaterialsFolderId,
  resolveClientMaterialsFolderUrl,
  resolveGdriveServiceAccountJson,
} from "./ammo-config";
import { getUploaderAccessToken } from "./google-oauth";
import { saveLinkAsset } from "./link-assets";

type EntityTarget = { partnerId?: string | null; customerId?: string | null };

function revalidateEntity(target: EntityTarget) {
  if (target.partnerId) revalidatePath(`/partners/${target.partnerId}`);
  if (target.customerId) revalidatePath(`/customers/${target.customerId}`);
}

async function bindFolderUrl(target: EntityTarget, folderUrl: string | null) {
  if (target.partnerId) {
    await db.partner.update({ where: { id: target.partnerId }, data: { gdriveFolderUrl: folderUrl } });
  } else if (target.customerId) {
    await db.customer.update({ where: { id: target.customerId }, data: { gdriveFolderUrl: folderUrl } });
  }
  revalidateEntity(target);
}

function cleanFolderUrl(raw: FormDataEntryValue | null): string | null {
  const url = String(raw ?? "").trim();
  return url || null;
}

export async function setPartnerGdriveFolderAction(partnerId: string, formData: FormData) {
  await requireUser();
  const gdriveFolderUrl = cleanFolderUrl(formData.get("gdriveFolderUrl"));
  if (gdriveFolderUrl && !parseGdriveFolderId(gdriveFolderUrl)) {
    return { ok: false as const, error: "Invalid Google Drive folder URL" };
  }
  await db.partner.update({ where: { id: partnerId }, data: { gdriveFolderUrl } });
  revalidatePath(`/partners/${partnerId}`);
  return { ok: true as const };
}

export async function setCustomerGdriveFolderAction(customerId: string, formData: FormData) {
  await requireUser();
  const gdriveFolderUrl = cleanFolderUrl(formData.get("gdriveFolderUrl"));
  if (gdriveFolderUrl && !parseGdriveFolderId(gdriveFolderUrl)) {
    return { ok: false as const, error: "Invalid Google Drive folder URL" };
  }
  await db.customer.update({ where: { id: customerId }, data: { gdriveFolderUrl } });
  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const };
}

export type MaterialFolderItem = { id: string; name: string; url: string; suggested: boolean };

async function listClientMaterialSubfolders() {
  const saJson = await resolveGdriveServiceAccountJson();
  if (!saJson) {
    throw new Error(
      "Google 服务账号未配置，无法浏览目录。请在设置 → 弹药库配置中配置服务账号（与弹药库浏览相同）。",
    );
  }
  const parentId = await resolveClientMaterialsFolderId();
  if (!parentId) throw new Error("Client materials folder is not configured");
  const { folderName, folders } = await listGdriveFolderContents(parentId, saJson);
  return { parentId, parentName: folderName, subfolders: folders };
}

/** 列出 07_Client Information 下的现有子目录（服务账号只读，与弹药库相同） */
export async function listClientMaterialFoldersAction(entityName?: string | null): Promise<
  | {
      ok: true;
      parentUrl: string;
      parentName: string;
      folders: MaterialFolderItem[];
      suggested: MaterialFolderItem | null;
    }
  | { ok: false; error: string }
> {
  await requireUser();
  try {
    const parentUrl = await resolveClientMaterialsFolderUrl();
    const { parentName, subfolders } = await listClientMaterialSubfolders();

    const folders: MaterialFolderItem[] = subfolders.map((f) => {
      const suggested = entityName ? !!findFolderByName([f], entityName) : false;
      return {
        id: f.id,
        name: f.name,
        url: folderUrlFromId(f.id),
        suggested,
      };
    });

    const suggested = entityName ? folders.find((f) => f.suggested) ?? null : null;
    return { ok: true, parentUrl, parentName, folders, suggested };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 选择已有子目录并绑定 */
export async function bindMaterialFolderIdAction(target: EntityTarget, folderId: string) {
  await requireUser();
  const id = folderId.trim();
  if (!id) return { ok: false as const, error: "Invalid folder" };
  const folderUrl = folderUrlFromId(id);
  await bindFolderUrl(target, folderUrl);
  return { ok: true as const, folderUrl };
}

/** 在 07_Client Information 下新建子目录并绑定 */
export async function createMaterialFolderAction(target: EntityTarget, name: string) {
  await requireUser();
  const folderName = name.trim();
  if (!folderName) return { ok: false as const, error: "Folder name is required" };

  try {
    const accessToken = await getUploaderAccessToken();
    const parentId = await resolveClientMaterialsFolderId();
    if (!parentId) return { ok: false as const, error: "Client materials folder is not configured" };

    const { subfolders: existing } = await listClientMaterialSubfolders();
    const dup = findFolderByName(existing, folderName);
    if (dup) {
      const folderUrl = folderUrlFromId(dup.id);
      await bindFolderUrl(target, folderUrl);
      return { ok: true as const, folderUrl, existed: true as const };
    }

    const created = await createGdriveFolderOauth(parentId, folderName, accessToken);
    await bindFolderUrl(target, created.webViewLink);
    return { ok: true as const, folderUrl: created.webViewLink, existed: false as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 粘贴外链作为材料（解析后落库并归档到伙伴/客户） */
export async function addMaterialLinkAction(
  target: { partnerId?: string | null; customerId?: string | null },
  formData: FormData,
) {
  const user = await requireUser();
  const url = String(formData.get("linkUrl") ?? "").trim();
  if (!url) return { ok: false as const, error: "URL cannot be empty" };

  const { asset } = await saveLinkAsset(url, user.id);
  await db.asset.update({
    where: { id: asset.id },
    data: {
      partnerId: target.partnerId ?? null,
      customerId: target.customerId ?? null,
    },
  });
  if (target.partnerId) revalidatePath(`/partners/${target.partnerId}`);
  if (target.customerId) revalidatePath(`/customers/${target.customerId}`);
  return { ok: true as const };
}

/** 从应用中移除一条材料记录（不会删除 Google Drive 上的实际文件） */
export async function deleteMaterialAssetAction(assetId: string) {
  await requireUser();
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { partnerId: true, customerId: true },
  });
  if (!asset) return;
  await db.asset.delete({ where: { id: assetId } });
  if (asset.partnerId) revalidatePath(`/partners/${asset.partnerId}`);
  if (asset.customerId) revalidatePath(`/customers/${asset.customerId}`);
}
