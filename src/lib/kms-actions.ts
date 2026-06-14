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
  if (!accessToken) return { error: "请填写 KMS 个人访问令牌" };

  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KMS_DEFAULT_BASE_URL;

  await db.userKmsCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, accessToken, baseUrl },
    update: { accessToken, baseUrl },
  });

  revalidatePath("/settings");
  revalidatePath("/tools");
  return { ok: true, message: "KMS 令牌已保存，后续无需重复输入。" };
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
  if (!token) return { error: "请填写令牌，或先保存后再测试已存令牌。" };

  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KMS_DEFAULT_BASE_URL;

  try {
    const result = await testKmsConnection({ baseUrl, token });
    return {
      ok: true,
      message: `连通成功：《${result.title}》（${result.spaceName}）\n预览：${result.preview}…`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteKmsCredentialAction() {
  const user = await requireUser();
  await db.userKmsCredential.deleteMany({ where: { userId: user.id } });
  revalidatePath("/settings");
  revalidatePath("/tools");
  return { ok: true };
}
