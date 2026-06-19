"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./session";
import { db } from "./db";
import { KNOWHOW_DEFAULT_BASE_URL, testKnowhowConnection } from "./knowhow";
import { normalizeKnowhowApiKey } from "./knowhow-token";

function cleanToken(raw: FormDataEntryValue | null) {
  const v = normalizeKnowhowApiKey(String(raw ?? ""));
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
  return {
    ok: true,
    message: `Know-how 检索令牌已保存（长度 ${apiKey.length}，尾号 ${apiKey.slice(-4)}）。建议点击「测试已保存」验证连接。`,
  };
}

export async function testSystemKnowhowCredentialAction(formData: FormData) {
  await requireSuperAdmin();
  const apiKey = cleanToken(formData.get("apiKey"));
  let token = apiKey;
  if (!token) {
    const cred = await db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } });
    token = cred?.apiKey ? normalizeKnowhowApiKey(cred.apiKey) : null;
  }
  if (!token) return { error: "请输入令牌或先保存" };
  const baseUrl = cleanToken(formData.get("baseUrl")) ?? KNOWHOW_DEFAULT_BASE_URL;
  try {
    const result = await testKnowhowConnection({ apiKey: token, baseUrl });
    if (result.count > 0) {
      return {
        ok: true,
        message: `连接成功（Key 长度 ${result.keyLength}，尾号 ${result.keyTail}）\n示例结果：「${result.sampleTitle}」\n解析到 ${result.count} 条记录`,
      };
    }
    return {
      ok: true,
      message: `API 连接成功（Key 长度 ${result.keyLength}，尾号 ${result.keyTail}），但未解析到检索结果。\n响应结构：${result.rawSummary}\n\n请确认 API Key 有检索权限，或联系 Know-how 平台管理员。`,
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
