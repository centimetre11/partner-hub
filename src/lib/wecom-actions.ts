"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import { isValidWecomUserId, sanitizeWecomUserId } from "./wecom-identity-validation";

export async function saveWecomUserIdAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("wecomUserId") ?? "").trim();
  const wecomUserId = raw ? sanitizeWecomUserId(raw) || null : null;

  if (wecomUserId && !isValidWecomUserId(wecomUserId)) {
    return {
      error:
        "企业微信 userid 格式无效。请只粘贴账号本身（不要带反引号 `），一般为字母数字与下划线，4–128 位",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { wecomUserId },
  });

  revalidatePath("/account");
  return {
    ok: true,
    message: wecomUserId ? `企业微信 userid 已保存：${wecomUserId}` : "已清除企业微信 userid",
  };
}
