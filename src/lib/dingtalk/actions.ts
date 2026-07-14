"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../session";
import { db } from "../db";
import { clearDingTalkTokenCache } from "./token";
import { getDingTalkAccessToken } from "./token";

function clean(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  return value || null;
}

export async function saveSystemDingTalkConfigAction(formData: FormData) {
  await requireSuperAdmin();
  const appKey = clean(formData.get("appKey"));
  const appSecret = clean(formData.get("appSecret"));
  const corpId = clean(formData.get("corpId"));
  const token = clean(formData.get("token"));
  const aesKey = clean(formData.get("aesKey"));
  const agentId = clean(formData.get("agentId"));
  const dingerTemplateId = clean(formData.get("dingerTemplateId"));
  const enabled = formData.get("enabled") !== "false";

  if (!appKey) return { error: "请填写 AppKey" };

  const stored = await db.systemDingTalkConfig.findUnique({ where: { id: "singleton" } });
  const finalSecret = appSecret || stored?.appSecret || process.env.DINGTALK_APP_SECRET?.trim() || null;
  if (!finalSecret) return { error: "请填写 AppSecret" };

  await db.systemDingTalkConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      corpId,
      appKey,
      appSecret: finalSecret,
      token,
      aesKey,
      agentId,
      dingerTemplateId,
      enabled,
    },
    update: {
      corpId,
      appKey,
      appSecret: finalSecret,
      token,
      aesKey,
      agentId,
      dingerTemplateId,
      enabled,
    },
  });

  clearDingTalkTokenCache();
  revalidatePath("/settings");
  return { ok: true, message: "钉钉配置已保存" };
}

export async function testSystemDingTalkConfigAction(formData: FormData) {
  await requireSuperAdmin();
  const appKey = clean(formData.get("appKey"));
  const appSecret = clean(formData.get("appSecret"));

  const stored = await db.systemDingTalkConfig.findUnique({ where: { id: "singleton" } });
  const key = appKey || stored?.appKey || process.env.DINGTALK_APP_KEY?.trim();
  const secret = appSecret || stored?.appSecret || process.env.DINGTALK_APP_SECRET?.trim();
  if (!key || !secret) return { error: "请填写 AppKey 与 AppSecret" };

  // temporarily upsert for token test if form has values
  if (appKey && appSecret) {
    await db.systemDingTalkConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        appKey: key,
        appSecret: secret,
        corpId: clean(formData.get("corpId")),
        token: clean(formData.get("token")),
        aesKey: clean(formData.get("aesKey")),
        agentId: clean(formData.get("agentId")),
        enabled: true,
      },
      update: {
        appKey: key,
        appSecret: secret,
      },
    });
    clearDingTalkTokenCache();
  }

  try {
    const accessToken = await getDingTalkAccessToken();
    return { ok: true, message: `access_token 获取成功（尾号 ${accessToken.slice(-4)}）` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSystemDingTalkConfigAction() {
  await requireSuperAdmin();
  await db.systemDingTalkConfig.deleteMany({ where: { id: "singleton" } });
  clearDingTalkTokenCache();
  revalidatePath("/settings");
  return { ok: true, message: "已清除钉钉配置" };
}
