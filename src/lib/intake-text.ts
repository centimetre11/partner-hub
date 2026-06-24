/** Strip partner-binding suffix appended to WeCom user messages before intent detection. */
export function stripIntakeSystemHint(content: string): string {
  const zh = content.indexOf("\n\n（系统提示：");
  if (zh >= 0) return content.slice(0, zh).trim();
  const en = content.indexOf("\n\n[System ");
  if (en >= 0) return content.slice(0, en).trim();
  return content.trim();
}

/** User-facing reply from JSON parse failure (LLM/heuristic may still recover the draft). */
export function isIntakeParseErrorReply(reply: string | undefined): boolean {
  return /格式有误|could not be parsed|format error|没能完整解析/i.test(reply ?? "");
}
