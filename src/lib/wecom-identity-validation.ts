/** 企微 AI 机器人成员 userid（常见 wo 开头、含下划线） */
export const WECOM_USER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{3,127}$/;

export const WECOM_DISPLAY_NAME_RE = /^[\w\u4e00-\u9fff\s.\-_@]{1,64}$/u;

/** 去掉从企微消息/ Markdown 复制时的包裹符号与不可见字符 */
export function sanitizeWecomUserId(raw: string): string {
  return raw
    .trim()
    .replace(/^[`'"\s]+|[`'"\s]+$/g, "")
    .replace(/[\u200b-\u200d\ufeff\u00a0]/g, "");
}

export function sanitizeWecomDisplayName(raw: string): string {
  return raw.trim().replace(/[\u200b-\u200d\ufeff\u00a0]/g, "");
}

export function isValidWecomUserId(value: string): boolean {
  const cleaned = sanitizeWecomUserId(value);
  return !!cleaned && WECOM_USER_ID_RE.test(cleaned);
}

export function isValidWecomDisplayName(value: string): boolean {
  const cleaned = sanitizeWecomDisplayName(value);
  return !!cleaned && WECOM_DISPLAY_NAME_RE.test(cleaned);
}
