"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./session";
import { db } from "./db";
import { EXMAIL_SMTP_DEFAULTS, normalizeFromEmail, resolveEmailConfig, validateFromEmail, type EmailConfig } from "./email-config";
import { sendEmail, testEmailConnection } from "./email";

function clean(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  return value || null;
}

function parseSmtpPort(raw: FormDataEntryValue | null) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) && value > 0 ? value : EXMAIL_SMTP_DEFAULTS.smtpPort;
}

async function resolveConfigFromForm(formData: FormData, allowStoredAuth = false): Promise<EmailConfig | null> {
  const fromEmailRaw = clean(formData.get("fromEmail"));
  const fromEmail = fromEmailRaw ? normalizeFromEmail(fromEmailRaw) : null;
  const authCode = clean(formData.get("authCode"));
  const smtpHost = clean(formData.get("smtpHost")) ?? EXMAIL_SMTP_DEFAULTS.smtpHost;
  const smtpPort = parseSmtpPort(formData.get("smtpPort"));
  const smtpSecure = formData.get("smtpSecure") !== "false";
  const fromName = clean(formData.get("fromName"));

  let finalAuthCode = authCode;
  if (!finalAuthCode && allowStoredAuth) {
    const stored = await db.systemEmailConfig.findUnique({ where: { id: "singleton" } });
    finalAuthCode = stored?.authCode ?? process.env.SMTP_PASS?.trim() ?? null;
  }
  if (!finalAuthCode && allowStoredAuth) {
    const envConfig = await resolveEmailConfig();
    finalAuthCode = envConfig?.authCode ?? null;
  }

  if (!fromEmail || !finalAuthCode) return null;
  return {
    smtpHost,
    smtpPort,
    smtpSecure,
    fromEmail,
    fromName,
    authCode: finalAuthCode,
  };
}

export async function saveSystemEmailConfigAction(formData: FormData) {
  await requireSuperAdmin();
  const fromEmailRaw = clean(formData.get("fromEmail"));
  const fromEmail = fromEmailRaw ? normalizeFromEmail(fromEmailRaw) : null;
  const authCode = clean(formData.get("authCode"));
  const smtpHost = clean(formData.get("smtpHost")) ?? EXMAIL_SMTP_DEFAULTS.smtpHost;
  const smtpPort = parseSmtpPort(formData.get("smtpPort"));
  const smtpSecure = formData.get("smtpSecure") !== "false";
  const fromName = clean(formData.get("fromName"));

  const emailError = fromEmail ? validateFromEmail(fromEmail) : "请填写发件邮箱";
  if (emailError || !fromEmail) return { error: emailError ?? "请填写发件邮箱" };

  const stored = await db.systemEmailConfig.findUnique({ where: { id: "singleton" } });
  const finalAuthCode = authCode || stored?.authCode || process.env.SMTP_PASS?.trim() || null;
  if (!finalAuthCode) return { error: "请填写 SMTP 客户端授权码" };

  await db.systemEmailConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      fromEmail,
      fromName,
      authCode: finalAuthCode,
      smtpHost,
      smtpPort,
      smtpSecure,
    },
    update: {
      fromEmail,
      fromName,
      authCode: finalAuthCode,
      smtpHost,
      smtpPort,
      smtpSecure,
    },
  });

  revalidatePath("/settings");
  return { ok: true, message: "邮件服务配置已保存" };
}

export async function testSystemEmailConfigAction(formData: FormData) {
  await requireSuperAdmin();
  const config = await resolveConfigFromForm(formData, true);
  if (!config) return { error: "请填写发件邮箱；授权码可留空以使用已保存配置" };

  try {
    await testEmailConnection(config);
    return { ok: true, message: `SMTP 连接成功（${config.smtpHost}:${config.smtpPort}）` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendTestEmailAction(formData: FormData) {
  await requireSuperAdmin();
  const to = clean(formData.get("testRecipient"));
  if (!to) return { error: "请填写测试收件人邮箱" };

  const config = await resolveConfigFromForm(formData, true);
  if (!config) return { error: "请先保存邮件配置，或填写完整发件邮箱与授权码" };

  try {
    await sendEmail(
      {
        to,
        subject: "Partner Hub 邮件服务测试",
        text: "这是一封测试邮件。若你收到此信，说明企业邮箱 SMTP 已配置成功。",
        html: "<p>这是一封<strong>测试邮件</strong>。</p><p>若你收到此信，说明企业邮箱 SMTP 已配置成功。</p>",
      },
      config,
    );
    return { ok: true, message: `测试邮件已发送至 ${to}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSystemEmailConfigAction() {
  await requireSuperAdmin();
  await db.systemEmailConfig.deleteMany({ where: { id: "singleton" } });
  revalidatePath("/settings");
  return { ok: true, message: "已清除数据库中的邮件配置（环境变量仍可用）" };
}
