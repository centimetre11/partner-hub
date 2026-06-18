"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";

const WECOM_USER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,63}$/;

export async function saveWecomUserIdAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("wecomUserId") ?? "").trim();
  const wecomUserId = raw || null;

  if (wecomUserId && !WECOM_USER_ID_RE.test(wecomUserId)) {
    return {
      error:
        "企业微信 userid 格式无效：仅支持字母、数字及 . _ @ -，且不能以特殊字符开头，最长 64 字符",
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
