// 线索快捷发邮件：模板变量、企业邮网页入口、常用附件下载。

import { getGivenName } from "@/lib/whatsapp";

export { getGivenName };

/** 模板占位符：{name} 联系人名 / {company} 公司名 / {city} 城市 / {country} 国家 */
export type LeadEmailTemplateVars = {
  name: string;
  company: string;
  city: string;
  country: string;
};

export type LeadEmailAttachment = {
  id: string;
  name: string;
  assetId: string;
  filename: string;
};

export const TEMPLATES_STORAGE_KEY = "leads.email.templates.v1";
export const ATTACHMENTS_STORAGE_KEY = "leads.email.attachments.v1";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 基础邮箱校验；无效返回 null。 */
export function normalizeLeadEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

/** 替换模板中的占位符。 */
export function applyLeadEmailTemplate(template: string, vars: LeadEmailTemplateVars): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{company\}/g, vars.company)
    .replace(/\{city\}/g, vars.city)
    .replace(/\{country\}/g, vars.country)
    .trim();
}

/** 解析 `主题|正文` 格式；`|` 仅分割第一段为主题。 */
export function parseEmailTemplate(raw: string): { subject: string; body: string } {
  const idx = raw.indexOf("|");
  if (idx < 0) return { subject: "", body: raw.trim() };
  return {
    subject: raw.slice(0, idx).trim(),
    body: raw.slice(idx + 1).trim(),
  };
}

export function buildExmailWebLink(): string {
  return "https://exmail.qq.com/login";
}

/** 格式化为可粘贴的撰写内容。 */
export function formatEmailClipboard(to: string, subject: string, body: string): string {
  const lines = [`收件人: ${to}`];
  if (subject.trim()) lines.push(`主题: ${subject.trim()}`);
  lines.push("---");
  if (body.trim()) lines.push(body.trim());
  return lines.join("\n");
}

export function buildAssetDownloadUrl(assetId: string): string {
  return `/api/assets/${assetId}`;
}

export function downloadAttachment(att: LeadEmailAttachment): void {
  const a = document.createElement("a");
  a.href = buildAssetDownloadUrl(att.assetId);
  a.download = att.filename;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 依次下载附件，降低浏览器批量拦截概率。 */
export async function downloadAttachmentsSequential(
  attachments: LeadEmailAttachment[],
  gapMs = 300,
): Promise<void> {
  for (let i = 0; i < attachments.length; i++) {
    downloadAttachment(attachments[i]!);
    if (i < attachments.length - 1) await delay(gapMs);
  }
}

/** 默认常用语（固定英文；用户可在界面自定义覆盖）。格式：主题|正文 */
export const DEFAULT_LEAD_EMAIL_TEMPLATES = [
  "Quick intro — FineReport & {company}|Hi {name}, I'm a consultant from FineReport (FanRuan). I noticed {company}'s interest in data analytics and would love to have a quick chat.",
  "Materials for {company}|Hi {name}, may I send over some materials and case studies tailored for {company}?",
  "Following up — {company}|Hi {name}, just following up on the solution we discussed — when would be a good time to talk?",
];
