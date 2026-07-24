import nodemailer, { type Transporter } from "nodemailer";
import "server-only";
import { db } from "./db";
import { isEmailConfigured, resolveEmailConfig, type EmailConfig } from "./email-config";

export type SendEmailOptions = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

/**
 * 连接池 + 限速配置。
 * Exmail/QQ 企业邮箱对「短时间内新建连接数」和「发信速率」都有硬限制，
 * 逐封新建连接、无间隔连发很容易触发 421/450 限流。
 * 这里用 nodemailer 内建连接池复用连接，并让它自己按速率排队。
 */
const POOL_OPTIONS = {
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  rateDelta: 1000, // 速率统计窗口（毫秒）
  rateLimit: 5, // 每个窗口最多发送的邮件数
} as const;

/** 发送重试次数（含首发），仅对瞬时/限流类错误重试 */
const MAX_SEND_ATTEMPTS = 3;

function normalizeRecipients(to: string | string[]) {
  const list = (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("收件人邮箱不能为空");
  return list.join(", ");
}

function transportKey(config: EmailConfig): string {
  return `${config.smtpHost}|${config.smtpPort}|${config.smtpSecure}|${config.fromEmail}|${config.authCode}`;
}

let cachedTransport: { key: string; transporter: Transporter } | null = null;

/** 返回复用的连接池 transporter；配置变化时重建并关闭旧连接池 */
function getPooledTransport(config: EmailConfig): Transporter {
  const key = transportKey(config);
  if (cachedTransport?.key === key) return cachedTransport.transporter;
  if (cachedTransport) {
    try {
      cachedTransport.transporter.close();
    } catch {
      /* ignore close error */
    }
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.fromEmail, pass: config.authCode },
    ...POOL_OPTIONS,
  });
  cachedTransport = { key, transporter };
  return transporter;
}

function formatFrom(config: EmailConfig) {
  return config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 判断是否为可重试的瞬时错误（连接类 / 4xx 限流类），5xx 永久错误不重试 */
function isTransientSmtpError(err: unknown): boolean {
  const e = err as { responseCode?: unknown; code?: unknown; message?: unknown };
  const responseCode = typeof e?.responseCode === "number" ? e.responseCode : undefined;
  if (responseCode !== undefined) return responseCode >= 400 && responseCode < 500;
  const code = typeof e?.code === "string" ? e.code : "";
  if (["ETIMEDOUT", "ECONNRESET", "ECONNECTION", "ESOCKET", "ETLS", "EDNS"].includes(code)) return true;
  const msg = (typeof e?.message === "string" ? e.message : "").toLowerCase();
  return /\b(421|450|451|452)\b|too many|rate limit|try again|temporar|timeout|connection|frequenc|超限|频率|过于频繁/.test(
    msg
  );
}

export async function testEmailConnection(config: EmailConfig) {
  // 一次性校验：用独立的非池化连接，验证后立即释放
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.fromEmail, pass: config.authCode },
  });
  try {
    await transporter.verify();
  } finally {
    try {
      transporter.close();
    } catch {
      /* ignore */
    }
  }
}

export async function sendEmail(options: SendEmailOptions, config?: EmailConfig) {
  const resolved = config ?? (await resolveEmailConfig());
  if (!isEmailConfigured(resolved)) {
    throw new Error("邮箱服务未配置，请在团队设置中填写发件邮箱与 SMTP 授权码");
  }

  const transporter = getPooledTransport(resolved);
  const mail = {
    from: formatFrom(resolved),
    to: normalizeRecipients(options.to),
    ...(options.cc ? { cc: normalizeRecipients(options.cc) } : {}),
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo: options.replyTo,
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      await transporter.sendMail(mail);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_SEND_ATTEMPTS || !isTransientSmtpError(err)) break;
      // 指数退避 + 抖动，缓解限流
      const backoff = attempt * 1500 + Math.floor(Math.random() * 500);
      console.warn(
        `[email] send attempt ${attempt}/${MAX_SEND_ATTEMPTS} failed, retrying in ${backoff}ms:`,
        err instanceof Error ? err.message : err
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

export async function sendEmailToUser(
  userId: string,
  subject: string,
  body: { text?: string; html?: string },
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.email) throw new Error("用户邮箱不存在");
  await sendEmail({ to: user.email, subject, ...body });
}

export async function sendEmailToUsers(
  userIds: string[],
  subject: string,
  body: { text?: string; html?: string },
) {
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { email: true },
  });
  const emails = users.map((user) => user.email).filter(Boolean);
  if (emails.length === 0) throw new Error("未找到有效收件人邮箱");
  await sendEmail({ to: emails, subject, ...body });
}
