/** Controlled process tags for opportunities (current multi + next single). */

export const PROCESS_TAG_CODES = [
  "DISCOVERY",
  "ASSESSMENT",
  "SOLUTION",
  "DEMO",
  "QUOTE",
  "BID_DOC",
  "BID",
  "NEGOTIATION",
  "CONTRACT",
  "PARTNER_ALIGN",
] as const;

export type ProcessTagCode = (typeof PROCESS_TAG_CODES)[number];

export const DEFAULT_PROCESS_TAGS: ProcessTagCode[] = ["DISCOVERY"];
export const DEFAULT_STAGE_JSON = JSON.stringify(DEFAULT_PROCESS_TAGS);

const CODE_SET = new Set<string>(PROCESS_TAG_CODES);

export function isProcessTagCode(value: string): value is ProcessTagCode {
  return CODE_SET.has(value);
}

export const PROCESS_TAG_LABELS_ZH: Record<ProcessTagCode, string> = {
  DISCOVERY: "客户调研 / 需求收敛",
  ASSESSMENT: "评估 / POC",
  SOLUTION: "方案设计",
  DEMO: "方案演示",
  QUOTE: "报价",
  BID_DOC: "写标书",
  BID: "投标",
  NEGOTIATION: "商务谈判",
  CONTRACT: "合同签署",
  PARTNER_ALIGN: "伙伴协同",
};

export const PROCESS_TAG_LABELS_EN: Record<ProcessTagCode, string> = {
  DISCOVERY: "Discovery / Requirements",
  ASSESSMENT: "Assessment / POC",
  SOLUTION: "Solution design",
  DEMO: "Demo",
  QUOTE: "Quote",
  BID_DOC: "Bid writing",
  BID: "Bidding",
  NEGOTIATION: "Negotiation",
  CONTRACT: "Contract",
  PARTNER_ALIGN: "Partner align",
};

export function processTagLabel(code: ProcessTagCode, locale: "zh" | "en" = "zh"): string {
  return locale === "en" ? PROCESS_TAG_LABELS_EN[code] : PROCESS_TAG_LABELS_ZH[code];
}

/** Heuristic map from legacy free-text stage/nextStep to a process code. */
export function mapFreeTextToProcessTag(text: string): ProcessTagCode | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (isProcessTagCode(text.trim().toUpperCase())) return text.trim().toUpperCase() as ProcessTagCode;

  const rules: [RegExp, ProcessTagCode][] = [
    [/伙伴协同|partner\s*align/i, "PARTNER_ALIGN"],
    [/合同|contract|签约|签署/i, "CONTRACT"],
    [/谈判|negotiat|商务谈/i, "NEGOTIATION"],
    [/投标|bidding|submit\s*bid/i, "BID"],
    [/标书|bid\s*doc|写标/i, "BID_DOC"],
    [/报价|quote|quotation|定价/i, "QUOTE"],
    [/演示|demo|presentation/i, "DEMO"],
    [/方案设计|solution\s*design|方案(?!演示)/i, "SOLUTION"],
    [/评估|poc|试用|assessment|evaluat/i, "ASSESSMENT"],
    [/调研|需求|收敛|诊断|discover|needs/i, "DISCOVERY"],
  ];
  for (const [re, code] of rules) {
    if (re.test(t)) return code;
  }
  return null;
}

/** Parse Opportunity.stage (JSON array or legacy free text) into process codes. */
export function parseProcessTags(raw: string | null | undefined): ProcessTagCode[] {
  if (!raw?.trim()) return [...DEFAULT_PROCESS_TAGS];
  const trimmed = raw.trim();

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const codes = parsed
          .map((x) => String(x).trim().toUpperCase())
          .filter(isProcessTagCode);
        if (codes.length) return [...new Set(codes)];
      }
    } catch {
      /* fall through */
    }
  }

  // Comma / Chinese顿号 separated codes or free text
  const parts = trimmed.split(/[,，、;/|]+/).map((p) => p.trim()).filter(Boolean);
  const fromParts: ProcessTagCode[] = [];
  for (const p of parts) {
    const upper = p.toUpperCase();
    if (isProcessTagCode(upper)) {
      fromParts.push(upper);
      continue;
    }
    const mapped = mapFreeTextToProcessTag(p);
    if (mapped) fromParts.push(mapped);
  }
  if (fromParts.length) return [...new Set(fromParts)];

  const single = mapFreeTextToProcessTag(trimmed);
  return single ? [single] : [...DEFAULT_PROCESS_TAGS];
}

export function serializeProcessTags(codes: ProcessTagCode[]): string {
  const unique = [...new Set(codes.filter(isProcessTagCode))];
  return JSON.stringify(unique.length ? unique : DEFAULT_PROCESS_TAGS);
}

/** Parse Opportunity.nextStep as a single process code (or legacy free text). */
export function parseNextProcessTag(raw: string | null | undefined): ProcessTagCode | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (isProcessTagCode(upper)) return upper;
  return mapFreeTextToProcessTag(trimmed);
}

export function normalizeNextProcessTag(raw: string | null | undefined): string | null {
  return parseNextProcessTag(raw);
}

/** Collect process tags from FormData (checkboxes name=processTag or stage JSON). */
export function processTagsFromFormData(formData: FormData): ProcessTagCode[] {
  const fromChecks = formData
    .getAll("processTag")
    .map((v) => String(v).trim().toUpperCase())
    .filter(isProcessTagCode);
  if (fromChecks.length) return [...new Set(fromChecks)];

  const stageRaw = String(formData.get("stage") ?? "").trim();
  if (stageRaw) return parseProcessTags(stageRaw);
  return [...DEFAULT_PROCESS_TAGS];
}

export function formatProcessTagsDisplay(
  raw: string | null | undefined,
  locale: "zh" | "en" = "zh",
  sep = " · "
): string {
  return parseProcessTags(raw)
    .map((c) => processTagLabel(c, locale))
    .join(sep);
}

export function formatNextProcessDisplay(
  raw: string | null | undefined,
  locale: "zh" | "en" = "zh"
): string {
  const code = parseNextProcessTag(raw);
  return code ? processTagLabel(code, locale) : "";
}

/** Compact list for AI prompts. */
export function processTagListForAi(locale: "zh" | "en" = "zh"): string {
  return PROCESS_TAG_CODES.map((c) => `${c}=${processTagLabel(c, locale)}`).join(
    locale === "zh" ? "；" : "; "
  );
}
