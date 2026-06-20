import { db } from "./db";

export const QQ_SMTP_DEFAULTS = {
  smtpHost: "smtp.qq.com",
  smtpPort: 465,
  smtpSecure: true,
} as const;

export type EmailConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string | null;
  authCode: string;
};

export type EmailConfigForClient = {
  configured: boolean;
  fromEmail: string;
  fromName: string;
  authTail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  updatedAt?: string;
};

function parseSmtpPort(raw: string | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 纯 QQ 号自动补 @qq.com；已是完整邮箱则原样返回（小写） */
export function normalizeFromEmail(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return value;
  if (value.includes("@")) return value;
  if (/^\d{5,11}$/.test(value)) return `${value}@qq.com`;
  return value;
}

export function validateFromEmail(email: string): string | null {
  if (!email) return "请填写发件 QQ 邮箱";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "发件邮箱格式不正确，请填写完整 QQ 邮箱，例如 544050789@qq.com";
  }
  return null;
}

function normalizeConfigEmail(config: EmailConfig): EmailConfig {
  return { ...config, fromEmail: normalizeFromEmail(config.fromEmail) };
}

function configFromEnv(): EmailConfig | null {
  const fromEmail = normalizeFromEmail(process.env.SMTP_USER?.trim() ?? "");
  const authCode = process.env.SMTP_PASS?.trim();
  if (!fromEmail || !authCode || validateFromEmail(fromEmail)) return null;
  return {
    smtpHost: process.env.SMTP_HOST?.trim() || QQ_SMTP_DEFAULTS.smtpHost,
    smtpPort: parseSmtpPort(process.env.SMTP_PORT, QQ_SMTP_DEFAULTS.smtpPort),
    smtpSecure: process.env.SMTP_SECURE !== "false",
    fromEmail,
    fromName: process.env.SMTP_FROM_NAME?.trim() || null,
    authCode,
  };
}

export async function resolveEmailConfig(): Promise<EmailConfig | null> {
  const row = await db.systemEmailConfig.findUnique({ where: { id: "singleton" } });
  if (row?.fromEmail?.trim() && row.authCode?.trim()) {
    return normalizeConfigEmail({
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpSecure: row.smtpSecure,
      fromEmail: row.fromEmail.trim(),
      fromName: row.fromName?.trim() || null,
      authCode: row.authCode,
    });
  }
  return configFromEnv();
}

export async function getEmailConfigForClient(): Promise<EmailConfigForClient> {
  const row = await db.systemEmailConfig.findUnique({ where: { id: "singleton" } });
  const resolved = await resolveEmailConfig();
  return {
    configured: !!resolved,
    fromEmail: row?.fromEmail?.trim() || process.env.SMTP_USER?.trim() || "",
    fromName: row?.fromName?.trim() || process.env.SMTP_FROM_NAME?.trim() || "",
    authTail: resolved?.authCode ? resolved.authCode.slice(-4) : "",
    smtpHost: row?.smtpHost || process.env.SMTP_HOST?.trim() || QQ_SMTP_DEFAULTS.smtpHost,
    smtpPort: row?.smtpPort ?? parseSmtpPort(process.env.SMTP_PORT, QQ_SMTP_DEFAULTS.smtpPort),
    smtpSecure: row?.smtpSecure ?? process.env.SMTP_SECURE !== "false",
    updatedAt: row?.updatedAt?.toISOString(),
  };
}

export function isEmailConfigured(config: EmailConfig | null): config is EmailConfig {
  return !!config?.fromEmail && !!config.authCode;
}
