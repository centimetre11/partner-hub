"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import { parseGdriveFolderId } from "./google-drive";
import { saveLinkAsset } from "./link-assets";

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
