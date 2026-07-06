/** 开放录入 / 客户端可用的 @机器人 解析（无 server / OAuth 依赖） */

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

/** 去掉 @机器人 前缀（与 wecom-user-resolve.stripWecomCommandPrefix 一致） */
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
