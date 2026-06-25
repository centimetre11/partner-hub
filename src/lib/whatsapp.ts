// WhatsApp 快捷联系：构造 wa.me 链接、归一化号码、模板变量替换。

/** 模板占位符：{name} 联系人名 / {company} 公司名 / {city} 城市 / {country} 国家 */
export type WhatsAppTemplateVars = {
  name: string;
  company: string;
  city: string;
  country: string;
};

/**
 * 归一化为 wa.me 可用号码：仅保留数字（去掉 +、空格、括号、连字符）。
 * "+971 55 842 8426" → "971558428426"；无有效数字返回 null。
 */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
}

/** 取联系人的「名」（首个空白分隔的词）。无则返回空串。 */
export function getGivenName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

/** 替换模板中的 {name} / {company} / {city} / {country} 占位符。 */
export function applyWhatsAppTemplate(template: string, vars: WhatsAppTemplateVars): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{company\}/g, vars.company)
    .replace(/\{city\}/g, vars.city)
    .replace(/\{country\}/g, vars.country)
    .trim();
}

/** 构造 https://wa.me/<digits>?text=<encoded> 通用链接（系统自动选择 App/网页）。 */
export function buildWhatsAppLink(phone: string, message: string): string {
  const base = `https://wa.me/${phone}`;
  const text = message.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** 浏览器打开：WhatsApp Web（web.whatsapp.com），带入文本。 */
export function buildWhatsAppWebLink(phone: string, message: string): string {
  const params = new URLSearchParams({ phone });
  const text = message.trim();
  if (text) params.set("text", text);
  return `https://web.whatsapp.com/send?${params.toString()}`;
}

/** App 打开：whatsapp:// 协议直接唤起桌面 / 手机客户端，带入文本。 */
export function buildWhatsAppAppLink(phone: string, message: string): string {
  const params = new URLSearchParams({ phone });
  const text = message.trim();
  if (text) params.set("text", text);
  return `whatsapp://send?${params.toString()}`;
}

/** 默认常用语模板（固定英文，不随界面语言切换；用户可在界面自定义覆盖）。 */
export const DEFAULT_WHATSAPP_TEMPLATES = [
  "Hi {name}, I'm a consultant from FineReport (FanRuan). I noticed {company}'s interest in data analytics and would love to have a quick chat.",
  "Hi {name}, may I send over some materials and case studies tailored for {company}?",
  "Hi {name}, just following up on the solution we discussed — when would be a good time to talk?",
];
