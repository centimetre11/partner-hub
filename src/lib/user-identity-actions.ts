"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSuperAdmin, requireUser } from "./session";
import {
  isValidWecomDisplayName,
  isValidWecomUserId,
  sanitizeWecomDisplayName,
  sanitizeWecomUserId,
} from "./wecom-identity-validation";

export type UserIdentityFields = {
  wecomUserId: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
};

function parseIdentityForm(formData: FormData): UserIdentityFields {
  const wecomUserIdRaw = String(formData.get("wecomUserId") ?? "").trim();
  const wecomDisplayNameRaw = String(formData.get("wecomDisplayName") ?? "").trim();
  const crmSalesmanName = String(formData.get("crmSalesmanName") ?? "").trim() || null;

  const wecomUserId = wecomUserIdRaw ? sanitizeWecomUserId(wecomUserIdRaw) || null : null;
  const wecomDisplayName = wecomDisplayNameRaw
    ? sanitizeWecomDisplayName(wecomDisplayNameRaw) || null
    : null;

  return { wecomUserId, wecomDisplayName, crmSalesmanName };
}

async function assertIdentityAvailable(
  userId: string,
  fields: UserIdentityFields,
): Promise<{ error?: string }> {
  if (fields.wecomUserId && !isValidWecomUserId(fields.wecomUserId)) {
    return {
      error:
        "企业微信 userid 格式无效。请只粘贴账号本身（不要带反引号 `），一般为字母数字与下划线，4–128 位",
    };
  }
  if (fields.wecomDisplayName && !isValidWecomDisplayName(fields.wecomDisplayName)) {
    return { error: "企微显示名格式无效：最长 64 字符，请勿包含特殊符号" };
  }

  if (fields.wecomUserId) {
    const taken = await db.user.findFirst({
      where: { wecomUserId: fields.wecomUserId, NOT: { id: userId } },
      select: { name: true },
    });
    if (taken) return { error: `企微 userid 已被「${taken.name}」绑定` };
  }

  if (fields.wecomDisplayName) {
    const rows = await db.user.findMany({
      where: { wecomDisplayName: { not: null }, NOT: { id: userId } },
      select: { name: true, wecomDisplayName: true },
    });
    const lower = fields.wecomDisplayName.toLowerCase();
    const taken = rows.find((r) => r.wecomDisplayName?.toLowerCase() === lower);
    if (taken) return { error: `企微显示名已被「${taken.name}」绑定` };
  }

  return {};
}

export async function saveMyUserIdentityAction(formData: FormData) {
  const user = await requireUser();
  const fields = parseIdentityForm(formData);
  const check = await assertIdentityAvailable(user.id, fields);
  if (check.error) return { error: check.error };

  await db.user.update({
    where: { id: user.id },
    data: fields,
  });

  revalidatePath("/account");
  revalidatePath("/settings");
  return { ok: true, message: "身份绑定已保存" };
}

export async function saveUserIdentityByAdminAction(userId: string, formData: FormData) {
  await requireSuperAdmin();
  const existing = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) return { error: "用户不存在" };

  const fields = parseIdentityForm(formData);
  const check = await assertIdentityAvailable(userId, fields);
  if (check.error) return { error: check.error };

  await db.user.update({
    where: { id: userId },
    data: fields,
  });

  revalidatePath("/settings");
  revalidatePath("/account");
  return { ok: true };
}

const BIND_CODE_TTL_MS = 15 * 60 * 1000;

function randomBindCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

/** Web 个人中心生成企微绑定码，群里 @机器人 绑定 XXXXXX 完成绑定 */
export async function generateWecomBindCodeAction() {
  const user = await requireUser();
  const code = randomBindCode();
  const expiresAt = new Date(Date.now() + BIND_CODE_TTL_MS);

  await db.user.update({
    where: { id: user.id },
    data: {
      wecomBindCode: code,
      wecomBindCodeExpiresAt: expiresAt,
    },
  });

  revalidatePath("/account");
  return {
    ok: true as const,
    code,
    expiresAt: expiresAt.toISOString(),
    message: `绑定码 ${code} 已生成，15 分钟内有效。请在企微群发送：@机器人 绑定 ${code}`,
  };
}
