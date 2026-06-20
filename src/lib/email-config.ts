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

function configFromEnv(): EmailConfig | null {
  const fromEmail = process.env.SMTP_USER?.trim();
  const authCode = process.env.SMTP_PASS?.trim();
  if (!fromEmail || !authCode) return null;
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
    return {
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpSecure: row.smtpSecure,
      fromEmail: row.fromEmail.trim(),
      fromName: row.fromName?.trim() || null,
      authCode: row.authCode,
    };
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
