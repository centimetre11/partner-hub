"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./session";
import { db } from "./db";
import { KNOWHOW_DEFAULT_BASE_URL, testKnowhowConnection } from "./knowhow";

function cleanToken(raw: FormDataEntryValue | null) {
  const v = String(raw ?? "").trim();
  return v || null;
}

export async function saveSystemKnowhowCredentialAction(formData: FormData) {
  await requireSuperAdmin();
  const apiKey = cleanToken(formData.get("apiKey"));
  if (!apiKey) return { error: "请输入 Know-how API 令牌" };
  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KNOWHOW_DEFAULT_BASE_URL;

  await db.systemKnowhowCredential.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", apiKey, baseUrl },
    update: { apiKey, baseUrl },
  });

  revalidatePath("/settings");
  revalidatePath("/knowhow");
  revalidatePath("/tools");
  return { ok: true, message: "Know-how 检索令牌已保存。" };
}

export async function testSystemKnowhowCredentialAction(formData: FormData) {
  await requireSuperAdmin();
  const apiKey = cleanToken(formData.get("apiKey"));
  const stored = cleanToken(formData.get("useStored"));
  let token = apiKey;
  if (!token && stored === "1") {
    const cred = await db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } });
    token = cred?.apiKey ?? null;
  }
  if (!token) return { error: "请输入令牌或先保存" };
  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KNOWHOW_DEFAULT_BASE_URL;
  try {
    const result = await testKnowhowConnection({ apiKey: token, baseUrl });
    return {
      ok: true,
      message: result.sampleTitle
        ? `连接成功，示例结果：「${result.sampleTitle}」`
        : "连接成功，当前检索未返回示例结果。",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSystemKnowhowCredentialAction() {
  await requireSuperAdmin();
  await db.systemKnowhowCredential.deleteMany({ where: { id: "singleton" } });
  revalidatePath("/settings");
  revalidatePath("/knowhow");
  revalidatePath("/tools");
  return { ok: true };
}
