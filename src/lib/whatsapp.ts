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

/** 构造 https://wa.me/<digits>?text=<encoded> 链接。 */
export function buildWhatsAppLink(phone: string, message: string): string {
  const base = `https://wa.me/${phone}`;
  const text = message.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** 默认常用语模板（用户可在界面自定义覆盖）。 */
export const DEFAULT_WHATSAPP_TEMPLATES_ZH = [
  "你好 {name}，我是帆软（FineReport / FanRuan）的顾问，看到贵司 {company} 在数据分析方面的需求，想和您简单交流一下。",
  "Hi {name}，方便的话我给您发一份适合 {company} 的产品资料和案例，您看可以吗？",
  "你好 {name}，想确认下我们之前提到的方案，您这边什么时间方便沟通？",
];

export const DEFAULT_WHATSAPP_TEMPLATES_EN = [
  "Hi {name}, I'm a consultant from FineReport (FanRuan). I noticed {company}'s interest in data analytics and would love to have a quick chat.",
  "Hi {name}, may I send over some materials and case studies tailored for {company}?",
  "Hi {name}, just following up on the solution we discussed — when would be a good time to talk?",
];
