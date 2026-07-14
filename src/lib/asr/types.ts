export type AsrLexicon = {
  realtimeEnabled: boolean;
  chunkSeconds: number;
  language: string;
  basePrompt: string;
  hotwords: string[];
  correctionRules: { from: string; to: string }[];
  llmCorrectEnabled: boolean;
  includePartnerNames: boolean;
};

export type AsrConfigForClient = {
  configured: boolean;
  realtimeEnabled: boolean;
  chunkSeconds: number;
  language: string;
  basePrompt: string;
  hotwords: string;
  correctionRules: string;
  llmCorrectEnabled: boolean;
  includePartnerNames: boolean;
  asrBaseUrlConfigured: boolean;
  updatedAt?: string;
};

export type AsrRecorderOptions = {
  realtimeEnabled: boolean;
  chunkSeconds: number;
};

export function parseHotwords(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[\n,，;；]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && s.length <= 40),
    ),
  ].slice(0, 200);
}

/** 支持 `错=>正` / `错=正` / `错 -> 正` */
export function parseCorrectionRules(raw: string | null | undefined): { from: string; to: string }[] {
  if (!raw?.trim()) return [];
  const rules: { from: string; to: string }[] = [];
  for (const line of raw.split(/\n+/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(.+?)\s*(?:=>|=|->|→)\s*(.+)$/);
    if (!m) continue;
    const from = m[1]!.trim();
    const to = m[2]!.trim();
    if (from && to && from !== to) rules.push({ from, to });
  }
  return rules.slice(0, 300);
}

export function applyCorrectionRules(text: string, rules: { from: string; to: string }[]): string {
  if (!text || !rules.length) return text;
  let out = text;
  const sorted = [...rules].sort((a, b) => b.from.length - a.from.length);
  for (const r of sorted) {
    if (!r.from) continue;
    out = out.split(r.from).join(r.to);
  }
  return out;
}

/** Whisper 常会复述 initial_prompt 里的指令句，识别后剥掉 */
export function stripAsrPromptArtifacts(text: string): string {
  if (!text?.trim()) return text ?? "";
  let out = text;
  const patterns = [
    /请正确书写以下专有名词[：:]\s*[^\n。.!！?]*/gi,
    /什么叫专有名词[：:]?[^\n。.!！?]*/gi,
    /专有名词[：:]\s*请正确书写[^\n。.!！?]*/gi,
    /这是一场[^。\n]*?(?:过伙伴)?会议[^。\n]*?(?:录音)?转写[。.]?/gi,
    /这是一场[^。\n]*商务[^。\n]*会议[^。\n]*[。.]?/gi,
  ];
  for (const re of patterns) out = out.replace(re, "");
  out = out
    .replace(/[、，,\s]*[。.]?\s*$/g, "")
    .replace(/^[、，,\s]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return out;
}

/** 整段几乎是提示词泄漏时视为无效 */
export function isLikelyAsrPromptLeak(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/请正确书写|什么叫专有名词|专有名词/.test(t) && t.length < 120) return true;
  if (/这是一场.+会议/.test(t) && t.length < 80) return true;
  return false;
}

/**
 * Whisper initial_prompt：只能放「像上文转写」的词，绝不能放「请正确书写」类指令
 * （指令会被模型念出来）。
 */
export function buildLexiconPrompt(opts: {
  lexicon: AsrLexicon;
  partnerNames?: string[];
}): string {
  const names =
    opts.lexicon.includePartnerNames && opts.partnerNames?.length
      ? [...new Set(opts.partnerNames.map((n) => n.trim()).filter(Boolean))].slice(0, 40)
      : [];
  const hot = opts.lexicon.hotwords.slice(0, 80);
  const vocab = [...new Set([...names, ...hot])];
  // 旧配置里的指令型 basePrompt 一律不用，避免泄漏
  const rawBase = opts.lexicon.basePrompt.trim();
  const base =
    rawBase && !/请正确|专有名词|转写|正确书写/.test(rawBase) ? rawBase : "";
  // 仅罗列专名，模拟上一句转写
  const vocabLine = vocab.length ? `${vocab.join("，")}。` : "";
  return [base, vocabLine].filter(Boolean).join(" ").slice(0, 400);
}

/** language=auto / 空 → 交给模型自动检测 */
export function resolveAsrLanguage(raw: string | null | undefined): string | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t || t === "auto" || t === "detect" || t === "none") return undefined;
  return t;
}
