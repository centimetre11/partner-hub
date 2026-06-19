"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./session";
import { db } from "./db";
import {
  parseKmsPageUrlsInput,
  serializeKmsPageUrls,
} from "./ammo-config";
import { testGdriveConnection } from "./google-drive";
import { testAmmoKmsUrls } from "./kms";

function clean(raw: FormDataEntryValue | null) {
  return String(raw ?? "").trim() || null;
}

export async function saveSystemAmmoConfigAction(formData: FormData) {
  await requireSuperAdmin();
  const gdriveFolderUrl = clean(formData.get("gdriveFolderUrl"));
  const gdriveServiceAccount = clean(formData.get("gdriveServiceAccount"));
  const kmsPageUrlsRaw = String(formData.get("kmsPageUrls") ?? "");
  const kmsPageUrls = serializeKmsPageUrls(parseKmsPageUrlsInput(kmsPageUrlsRaw));

  const existing = await db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
  await db.systemAmmoConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      gdriveFolderUrl,
      gdriveServiceAccount: gdriveServiceAccount ?? existing?.gdriveServiceAccount ?? null,
      kmsPageUrls,
    },
    update: {
      gdriveFolderUrl,
      ...(gdriveServiceAccount ? { gdriveServiceAccount } : {}),
      kmsPageUrls,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/materials");
  return { ok: true, message: "Ammo library settings saved." };
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
    message: `Drive OK — ${result.fileCount} file(s) in folder${result.sampleName ? `, e.g. "${result.sampleName}"` : ""}`,
  };
}

export async function testSystemAmmoKmsAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const urls = parseKmsPageUrlsInput(String(formData.get("kmsPageUrls") ?? ""));
  if (!urls.length) return { error: "Enter at least one KMS page URL" };

  const result = await testAmmoKmsUrls(urls, user.id);
  if (!result.ok) return { error: result.error };
  return {
    ok: true,
    message: `KMS OK — ${result.pageCount} page(s)${result.sampleTitle ? `, e.g. "${result.sampleTitle}"` : ""}`,
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
