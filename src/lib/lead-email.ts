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

export type LeadEmailTemplate = {
  id: string;
  subject: string;
  /** Markdown 正文（支持加粗、斜体、链接等） */
  body: string;
};

export type LeadEmailAttachment = {
  id: string;
  name: string;
  assetId: string;
  filename: string;
};

export const TEMPLATES_STORAGE_KEY = "leads.email.templates.v2";
export const TEMPLATES_STORAGE_KEY_V1 = "leads.email.templates.v1";
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

function newTemplateId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stringTemplatesToObjects(lines: string[]): LeadEmailTemplate[] {
  return lines.map((line) => {
    const parsed = parseEmailTemplate(line);
    return { id: newTemplateId(), subject: parsed.subject, body: parsed.body };
  });
}

/** 默认常用语。 */
export const DEFAULT_LEAD_EMAIL_TEMPLATES: LeadEmailTemplate[] = stringTemplatesToObjects([
  "Quick intro — FineReport & {company}|Hi {name}, I'm a consultant from FineReport (FanRuan). I noticed {company}'s interest in data analytics and would love to have a quick chat.",
  "Materials for {company}|Hi {name}, may I send over some materials and case studies tailored for {company}?",
  "Following up — {company}|Hi {name}, just following up on the solution we discussed — when would be a good time to talk?",
]);

/** 从 localStorage 原始值迁移为结构化模板。 */
export function migrateEmailTemplates(raw: unknown): LeadEmailTemplate[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_LEAD_EMAIL_TEMPLATES;
  if (typeof raw[0] === "string") return stringTemplatesToObjects(raw as string[]);
  return (raw as LeadEmailTemplate[])
    .filter((t) => t && typeof t.subject === "string" && typeof t.body === "string")
    .map((t) => ({
      id: t.id || newTemplateId(),
      subject: t.subject,
      body: t.body,
    }));
}

/** 应用占位符到结构化模板。 */
export function applyLeadEmailTemplateRecord(
  tpl: LeadEmailTemplate,
  vars: LeadEmailTemplateVars,
): { subject: string; body: string } {
  return {
    subject: applyLeadEmailTemplate(tpl.subject, vars),
    body: applyLeadEmailTemplate(tpl.body, vars),
  };
}

/** 模板卡片 / chip 展示标签。 */
export function templateChipLabel(tpl: LeadEmailTemplate, vars?: LeadEmailTemplateVars): string {
  const subject = vars ? applyLeadEmailTemplate(tpl.subject, vars) : tpl.subject;
  if (subject.trim()) return subject;
  const body = vars ? applyLeadEmailTemplate(tpl.body, vars) : tpl.body;
  return markdownToPlainText(body).slice(0, 40) || "…";
}

/** Markdown 转纯文本（mailto / 剪贴板降级）。 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Markdown 转 HTML（浏览器助手注入企业邮富文本编辑器）。 */
export function markdownToEmailHtml(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";

  const blocks = trimmed.split(/\n{2,}/);
  const parts: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.every((l) => /^[-*+]\s+/.test(l.trim()))) {
      parts.push(
        "<ul>" +
          lines
            .map((l) => `<li>${inlineMarkdownToHtml(l.replace(/^[-*+]\s+/, "").trim())}</li>`)
            .join("") +
          "</ul>",
      );
      continue;
    }
    if (lines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
      parts.push(
        "<ol>" +
          lines
            .map((l) => `<li>${inlineMarkdownToHtml(l.replace(/^\d+\.\s+/, "").trim())}</li>`)
            .join("") +
          "</ol>",
      );
      continue;
    }
    const para = lines.map((l) => inlineMarkdownToHtml(l)).join("<br>");
    parts.push(`<p>${para || "<br>"}</p>`);
  }

  return parts.join("");
}

/** 企业邮网页入口（已登录时直达邮箱；未登录会跳转登录）。 */
export function buildExmailWebLink(): string {
  return "https://work.weixin.qq.com/mail/";
}

/**
 * mailto 链接：预填收件人 / 主题 / 正文（正文为纯文本）。
 */
export function buildMailtoLink(to: string, subject: string, body: string): string {
  const plainBody = markdownToPlainText(body);
  const parts: string[] = [];
  if (subject.trim()) parts.push(`subject=${encodeURIComponent(subject.trim())}`);
  if (plainBody.trim()) parts.push(`body=${encodeURIComponent(plainBody.trim())}`);
  const qs = parts.join("&");
  return qs ? `mailto:${to}?${qs}` : `mailto:${to}`;
}

export function openMailtoCompose(to: string, subject: string, body: string): void {
  const a = document.createElement("a");
  a.href = buildMailtoLink(to, subject, body);
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** 格式化为可粘贴的撰写内容（mailto 未关联时的备用）。 */
export function formatEmailClipboard(to: string, subject: string, body: string): string {
  const plainBody = markdownToPlainText(body);
  const lines = [`收件人: ${to}`];
  if (subject.trim()) lines.push(`主题: ${subject.trim()}`);
  lines.push("---");
  if (plainBody.trim()) lines.push(plainBody.trim());
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
