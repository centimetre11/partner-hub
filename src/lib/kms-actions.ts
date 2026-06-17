"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { db } from "./db";
import { KMS_DEFAULT_BASE_URL, testKmsConnection } from "./kms";

function cleanToken(raw: FormDataEntryValue | null) {
  const v = String(raw ?? "").trim();
  return v || null;
}

export async function saveKmsCredentialAction(formData: FormData) {
  const user = await requireUser();
  const accessToken = cleanToken(formData.get("accessToken"));
  if (!accessToken) return { error: "Please enter the KMS personal access token" };

  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KMS_DEFAULT_BASE_URL;

  await db.userKmsCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, accessToken, baseUrl },
    update: { accessToken, baseUrl },
  });

  revalidatePath("/settings");
  revalidatePath("/settings/kms");
  revalidatePath("/tools");
  return { ok: true, message: "KMS token saved. You won't need to enter it again." };
}

export async function testKmsCredentialAction(formData: FormData) {
  const user = await requireUser();
  const accessToken = cleanToken(formData.get("accessToken"));
  const stored = cleanToken(formData.get("useStored"));

  let token = accessToken;
  if (!token && stored === "1") {
    const cred = await db.userKmsCredential.findUnique({ where: { userId: user.id } });
    token = cred?.accessToken ?? null;
  }
  if (!token) return { error: "Enter a token, or save one first and then test the stored token." };

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

export async function deleteKmsCredentialAction() {
  const user = await requireUser();
  await db.userKmsCredential.deleteMany({ where: { userId: user.id } });
  revalidatePath("/settings");
  revalidatePath("/settings/kms");
  revalidatePath("/tools");
  return { ok: true };
}
