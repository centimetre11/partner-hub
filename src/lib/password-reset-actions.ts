"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { sendEmail } from "./email";
import { isEmailServiceConfigured } from "./email-config";
import { getLocale } from "./i18n/locale-server";
import { getMessages } from "./i18n/messages";
import { recordSystemEvent } from "./activity-log";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
}

/** 请求找回密码：无论邮箱是否存在都返回同一成功文案，避免枚举账号 */
export async function requestPasswordResetAction(_: unknown, formData: FormData) {
  const locale = await getLocale();
  const t = getMessages(locale).forgotPassword;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: t.emailRequired };

  if (!(await isEmailServiceConfigured())) {
    return { error: t.emailNotConfigured };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashResetToken(token),
        passwordResetExpiresAt: expiresAt,
      },
    });

    const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
    try {
      await sendEmail({
        to: user.email,
        subject: t.mailSubject,
        text: t.mailText.replace("{name}", user.name).replace("{url}", resetUrl).replace("{minutes}", "60"),
        html: t.mailHtml
          .replaceAll("{name}", user.name)
          .replaceAll("{url}", resetUrl)
          .replaceAll("{minutes}", "60"),
      });
      void recordSystemEvent({
        category: "AUTH",
        action: "auth.password_reset_requested",
        actorId: user.id,
        actorLabel: user.name,
        summary: `${user.email} 请求重置密码`,
        meta: { email: user.email },
      });
    } catch (e) {
      await db.user.update({
        where: { id: user.id },
        data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
      });
      return { error: e instanceof Error ? e.message : t.sendFailed };
    }
  }

  return { ok: true, message: t.sentGeneric };
}

export async function resetPasswordWithTokenAction(_: unknown, formData: FormData) {
  const locale = await getLocale();
  const t = getMessages(locale).forgotPassword;
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) return { error: t.invalidToken };
  if (!password || password.length < 6) return { error: t.passwordTooShort };
  if (password !== confirm) return { error: t.passwordMismatch };

  const tokenHash = hashResetToken(token);
  const user = await db.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gt: new Date() },
    },
  });
  if (!user) return { error: t.invalidToken };

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });

  void recordSystemEvent({
    category: "AUTH",
    action: "auth.password_reset_completed",
    actorId: user.id,
    actorLabel: user.name,
    summary: `${user.email} 已通过邮件链接重置密码`,
    meta: { email: user.email },
  });

  return { ok: true, message: t.resetSuccess };
}
