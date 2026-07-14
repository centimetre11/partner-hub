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

export function buildLexiconPrompt(opts: {
  lexicon: AsrLexicon;
  partnerNames?: string[];
}): string {
  const parts: string[] = [];
  if (opts.lexicon.basePrompt.trim()) parts.push(opts.lexicon.basePrompt.trim());
  const names =
    opts.lexicon.includePartnerNames && opts.partnerNames?.length
      ? [...new Set(opts.partnerNames.map((n) => n.trim()).filter(Boolean))].slice(0, 40)
      : [];
  const hot = opts.lexicon.hotwords.slice(0, 80);
  const vocab = [...new Set([...names, ...hot])];
  if (vocab.length) {
    parts.push(`请正确书写以下专有名词：${vocab.join("、")}。`);
  }
  return parts.join(" ").slice(0, 800);
}
