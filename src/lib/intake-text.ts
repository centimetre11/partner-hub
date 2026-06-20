/** Strip partner-binding suffix appended to WeCom user messages before intent detection. */
export function stripIntakeSystemHint(content: string): string {
  const zh = content.indexOf("\n\n（系统提示：");
  if (zh >= 0) return content.slice(0, zh).trim();
  const en = content.indexOf("\n\n[System ");
  if (en >= 0) return content.slice(0, en).trim();
  return content.trim();
}
