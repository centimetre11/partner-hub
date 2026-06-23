"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin, requireUser } from "./session";
import { db } from "./db";
import { fetchAmmoGdriveBrowse, testGdriveConnection } from "./google-drive";
import type { GdriveBrowseResult } from "./google-drive";

function clean(raw: FormDataEntryValue | null) {
  return String(raw ?? "").trim() || null;
}

export async function saveSystemAmmoConfigAction(formData: FormData) {
  await requireSuperAdmin();
  const gdriveFolderUrl = clean(formData.get("gdriveFolderUrl"));
  const gdriveServiceAccount = clean(formData.get("gdriveServiceAccount"));

  const existing = await db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
  await db.systemAmmoConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      gdriveFolderUrl,
      gdriveServiceAccount: gdriveServiceAccount ?? existing?.gdriveServiceAccount ?? null,
    },
    update: {
      gdriveFolderUrl,
      ...(gdriveServiceAccount ? { gdriveServiceAccount } : {}),
    },
  });

  revalidatePath("/settings");
  revalidatePath("/materials");
  return { ok: true, message: "Ammo library settings saved." };
}

export async function browseGdriveFolderAction(folderId: string): Promise<GdriveBrowseResult> {
  await requireUser();
  return fetchAmmoGdriveBrowse(folderId);
}

export async function testSystemAmmoGdriveAction(formData: FormData) {
  await requireSuperAdmin();
  const folderUrl = clean(formData.get("gdriveFolderUrl"));
  let saJson = clean(formData.get("gdriveServiceAccount"));
  const useStored = clean(formData.get("useStoredSa")) === "1";

  if (!saJson && useStored) {
    const row = await db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
    saJson = row?.gdriveServiceAccount?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || null;
  }

  if (!folderUrl) return { error: "Enter a Google Drive folder URL" };
  if (!saJson) return { error: "Enter service account JSON or save one first" };

  const result = await testGdriveConnection(folderUrl, saJson);
  if (!result.ok) return { error: result.error };
  return {
    ok: true,
    message: `Drive OK — ${result.folderCount} folder(s), ${result.fileCount} file(s) at root${result.sampleName ? `, e.g. "${result.sampleName}"` : ""}`,
  };
}

export async function clearSystemAmmoServiceAccountAction() {
  await requireSuperAdmin();
  const row = await db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
  if (row) {
    await db.systemAmmoConfig.update({
      where: { id: "singleton" },
      data: { gdriveServiceAccount: null },
    });
  }
  revalidatePath("/settings");
  revalidatePath("/materials");
  return { ok: true, message: "Stored service account cleared." };
}

// ============ OAuth 上传账号 ============

export async function saveGdriveOauthClientAction(formData: FormData) {
  await requireSuperAdmin();
  const clientId = clean(formData.get("gdriveOauthClientId"));
  const clientSecret = clean(formData.get("gdriveOauthClientSecret"));
  if (!clientId) return { error: "Enter the OAuth Client ID" };

  await db.systemAmmoConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      gdriveOauthClientId: clientId,
      gdriveOauthClientSecret: clientSecret,
    },
    update: {
      gdriveOauthClientId: clientId,
      // Secret 为空时保留原值（避免误清空）
      ...(clientSecret ? { gdriveOauthClientSecret: clientSecret } : {}),
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: "OAuth client saved. Now click Connect Google account." };
}

export async function disconnectGdriveUploaderAction() {
  await requireSuperAdmin();
  const row = await db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
  if (row) {
    await db.systemAmmoConfig.update({
      where: { id: "singleton" },
      data: { gdriveOauthRefreshToken: null, gdriveUploaderEmail: null },
    });
  }
  revalidatePath("/settings");
  return { ok: true, message: "Upload account disconnected." };
}
