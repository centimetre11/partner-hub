import nodemailer from "nodemailer";
import { db } from "./db";
import { isEmailConfigured, resolveEmailConfig, type EmailConfig } from "./email-config";

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

function normalizeRecipients(to: string | string[]) {
  const list = (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) throw new Error("收件人邮箱不能为空");
  return list.join(", ");
}

function createTransport(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.fromEmail,
      pass: config.authCode,
    },
  });
}

function formatFrom(config: EmailConfig) {
  return config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;
}

export async function testEmailConnection(config: EmailConfig) {
  const transporter = createTransport(config);
  await transporter.verify();
}

export async function sendEmail(options: SendEmailOptions, config?: EmailConfig) {
  const resolved = config ?? (await resolveEmailConfig());
  if (!isEmailConfigured(resolved)) {
    throw new Error("邮箱服务未配置，请在团队设置中填写 QQ 邮箱与授权码");
  }

  const transporter = createTransport(resolved);
  await transporter.sendMail({
    from: formatFrom(resolved),
    to: normalizeRecipients(options.to),
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo: options.replyTo,
  });
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
