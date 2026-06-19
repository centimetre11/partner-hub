"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSuperAdmin, requireUser } from "./session";

const WECOM_USER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,63}$/;
const WECOM_DISPLAY_NAME_RE = /^[\w\u4e00-\u9fff\s.\-_@]{1,64}$/;

export type UserIdentityFields = {
  wecomUserId: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
};

function parseIdentityForm(formData: FormData): UserIdentityFields {
  const wecomUserId = String(formData.get("wecomUserId") ?? "").trim() || null;
  const wecomDisplayName = String(formData.get("wecomDisplayName") ?? "").trim() || null;
  const crmSalesmanName = String(formData.get("crmSalesmanName") ?? "").trim() || null;
  return { wecomUserId, wecomDisplayName, crmSalesmanName };
}

async function assertIdentityAvailable(
  userId: string,
  fields: UserIdentityFields,
): Promise<{ error?: string }> {
  if (fields.wecomUserId && !WECOM_USER_ID_RE.test(fields.wecomUserId)) {
    return {
      error:
        "企业微信 userid 格式无效：仅支持字母、数字及 . _ @ -，且不能以特殊字符开头，最长 64 字符",
    };
  }
  if (fields.wecomDisplayName && !WECOM_DISPLAY_NAME_RE.test(fields.wecomDisplayName)) {
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
