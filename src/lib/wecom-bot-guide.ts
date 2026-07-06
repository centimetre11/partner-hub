/** 应用消息里引导用户去智能机器人 / 移动工作台 AI 的文案与链接 */

import { buildWecomOAuthStartUrl } from "@/lib/wecom-oauth";

export function resolveAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
}

export function resolveWecomBotDisplayName(): string {
  return process.env.WECOM_BOT_DISPLAY_NAME?.trim() || "MEA 伙伴助手";
}

/** @ 前缀后的机器人显示名（群聊指令常见；不含中文，避免吞掉「给宋健…」等业务正文） */
export function extractWecomAtMention(text: string): string | null {
  const t = text.trim();
  const multiWord = t.match(/^@([\w.\s-]{1,40})\s+/);
  if (multiWord?.[1]?.trim()) return multiWord[1].trim();
  const configured = resolveWecomBotDisplayName();
  if (configured && t.startsWith(`@${configured}`)) return configured;
  const single = t.match(/^@([^\s@]{1,40})\s+/);
  return single?.[1]?.trim() ?? null;
}

/** 去掉 @机器人 前缀（开放录入解析用，无 server 依赖；与 wecom-user-resolve.stripWecomCommandPrefix 一致） */
export function stripWecomCommandPrefixForIntake(text: string): string {
  let t = text.trim();
  const multiWord = t.match(/^@([\w.\s-]{1,40})\s+([\s\S]+)$/);
  if (multiWord?.[2]) return multiWord[2].trim();
  const configured = resolveWecomBotDisplayName();
  if (configured) {
    const escaped = configured.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = t.replace(new RegExp(`^@${escaped}\\s+`), "").trim();
    if (stripped !== t) return stripped;
  }
  return t.replace(/^(?:@[^\s]+\s*)+/, "").trim();
}

/** partnerName 是否其实是 @ 机器人，而非业务伙伴/客户 */
export function isLikelyWecomBotMentionName(name: string, userText?: string): boolean {
  const q = name.trim().replace(/^@/, "");
  if (!q) return false;
  const configured = resolveWecomBotDisplayName();
  const lower = q.toLowerCase();
  const cfgLower = configured.toLowerCase();
  if (lower === cfgLower) return true;
  if (lower.includes("beard gang") || cfgLower.includes(lower) || lower.includes(cfgLower)) return true;
  const at = userText ? extractWecomAtMention(userText) : null;
  if (at && at.toLowerCase() === lower) return true;
  return false;
}

/** 引导页：说明如何找到机器人 + 一键打开移动工作台（textcard 不再默认跳此页） */
export function wecomBotGuidePageUrl(): string {
  return `${resolveAppBaseUrl()}/wecom/bot`;
}

/** 企微内打开移动工作台（OAuth 后进入 /mobile） */
export function wecomMobileAiOAuthUrl(): string {
  return buildWecomOAuthStartUrl("/mobile", resolveAppBaseUrl());
}

/** 企微 PC 工作台应用主页（OAuth 后进入桌面端首页） */
export function wecomPcOAuthUrl(): string {
  return buildWecomOAuthStartUrl("/", resolveAppBaseUrl());
}

/** 应用消息 textcard 默认跳转：直达移动工作台（企微 OAuth） */
export function wecomAppTextcardJumpUrl(): string {
  return wecomMobileAiOAuthUrl();
}

export const DEFAULT_BOT_GUIDE_BTNTXT = "工作台";

export function appendWecomBotGuideText(content: string): string {
  const url = wecomAppTextcardJumpUrl();
  return `${content.trim()}\n\n💬 打开移动工作台：${url}`;
}

/** textcard description（支持企微 HTML：br / div.gray） */
export function buildBotGuideTextcardDescription(body: string): string {
  const main = body.trim().replace(/\n/g, "<br/>");
  const tail = `<div class="gray">点击下方按钮打开移动工作台。</div>`;
  return main ? `${main}<br/>${tail}` : tail;
}
