"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./session";
import { db } from "./db";
import { KMS_DEFAULT_BASE_URL, testKmsConnection } from "./kms";

function cleanToken(raw: FormDataEntryValue | null) {
  const v = String(raw ?? "").trim();
  return v || null;
}

export async function saveSystemKmsCredentialAction(formData: FormData) {
  await requireSuperAdmin();
  const accessToken = cleanToken(formData.get("accessToken"));
  if (!accessToken) return { error: "Please enter the team KMS token" };
  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KMS_DEFAULT_BASE_URL;

  await db.systemKmsCredential.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", accessToken, baseUrl },
    update: { accessToken, baseUrl },
  });

  revalidatePath("/settings");
  revalidatePath("/account");
  revalidatePath("/tools");
  return { ok: true, message: "Team KMS fallback token saved." };
}

export async function testSystemKmsCredentialAction(formData: FormData) {
  await requireSuperAdmin();
  const accessToken = cleanToken(formData.get("accessToken"));
  const stored = cleanToken(formData.get("useStored"));
  let token = accessToken;
  if (!token && stored === "1") {
    const cred = await db.systemKmsCredential.findUnique({ where: { id: "singleton" } });
    token = cred?.accessToken ?? null;
  }
  if (!token) return { error: "Enter a token or save one first" };
  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KMS_DEFAULT_BASE_URL;
  try {
    const result = await testKmsConnection({ baseUrl, token });
    return {
      ok: true,
      message: `Connection successful: "${result.title}" (${result.spaceName})\nPreview: ${result.preview}…`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSystemKmsCredentialAction() {
  await requireSuperAdmin();
  await db.systemKmsCredential.deleteMany({ where: { id: "singleton" } });
  revalidatePath("/settings");
  revalidatePath("/account");
  revalidatePath("/tools");
  return { ok: true };
}
