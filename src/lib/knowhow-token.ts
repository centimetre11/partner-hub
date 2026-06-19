/** 清洗粘贴的 Know-how API Key：去掉 Bearer 前缀、引号、不可见字符等 */
export function normalizeKnowhowApiKey(raw: string): string {
  let v = raw.replace(/[\u200B-\u200D\uFEFF]/g, "");
  v = v.replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  v = v.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith("`") && v.endsWith("`"))
  ) {
    v = v.slice(1, -1).trim();
  }
  while (/^bearer\s+/i.test(v)) {
    v = v.replace(/^bearer\s+/i, "").trim();
  }
  v = v.replace(/[\r\n\t]/g, "");
  return v.trim();
}
