/** Opportunity status: probability pipeline + closed/paused outcomes. */

export const OPPORTUNITY_STATUS_CODES = [
  "P20",
  "P50",
  "P80",
  "WON",
  "LOST",
  "PAUSED",
] as const;

export type OpportunityStatusCode = (typeof OPPORTUNITY_STATUS_CODES)[number];

/** Legacy "进行中" — treated as P20 when reading. */
export const LEGACY_ACTIVE = "ACTIVE";

export const DEFAULT_OPPORTUNITY_STATUS: OpportunityStatusCode = "P20";

/** Statuses that count as open / in-pipeline (not won/lost/paused). */
export const OPEN_OPPORTUNITY_STATUSES: readonly string[] = ["P20", "P50", "P80", LEGACY_ACTIVE];

const CODE_SET = new Set<string>(OPPORTUNITY_STATUS_CODES);

export function isOpportunityStatusCode(value: string): value is OpportunityStatusCode {
  return CODE_SET.has(value);
}

export function normalizeOpportunityStatus(
  raw: string | null | undefined
): OpportunityStatusCode {
  if (!raw?.trim()) return DEFAULT_OPPORTUNITY_STATUS;
  const upper = raw.trim().toUpperCase();
  if (upper === LEGACY_ACTIVE) return "P20";
  if (isOpportunityStatusCode(upper)) return upper;
  // Heuristics for AI / free text
  if (/80|高概率|high/i.test(raw)) return "P80";
  if (/50|中概率|medium|mid/i.test(raw)) return "P50";
  if (/20|低概率|low/i.test(raw)) return "P20";
  if (/won|赢/i.test(raw)) return "WON";
  if (/lost|丢/i.test(raw)) return "LOST";
  if (/pause|暂停|搁置/i.test(raw)) return "PAUSED";
  if (/active|进行/i.test(raw)) return "P20";
  return DEFAULT_OPPORTUNITY_STATUS;
}

export function isOpenOpportunityStatus(status: string): boolean {
  return OPEN_OPPORTUNITY_STATUSES.includes(status) || OPEN_OPPORTUNITY_STATUSES.includes(normalizeOpportunityStatus(status));
}

export const OPPORTUNITY_STATUS_LABELS_ZH: Record<OpportunityStatusCode, string> = {
  P20: "20%概率",
  P50: "50%概率",
  P80: "80%概率",
  WON: "赢单",
  LOST: "丢单",
  PAUSED: "暂停",
};

export const OPPORTUNITY_STATUS_LABELS_EN: Record<OpportunityStatusCode, string> = {
  P20: "20% probability",
  P50: "50% probability",
  P80: "80% probability",
  WON: "Won",
  LOST: "Lost",
  PAUSED: "Paused",
};

export function opportunityStatusLabel(
  raw: string | null | undefined,
  locale: "zh" | "en" = "zh"
): string {
  const code = normalizeOpportunityStatus(raw);
  return locale === "en" ? OPPORTUNITY_STATUS_LABELS_EN[code] : OPPORTUNITY_STATUS_LABELS_ZH[code];
}

export function opportunityStatusTone(
  raw: string | null | undefined
): "green" | "amber" | "blue" | "indigo" | "zinc" {
  const code = normalizeOpportunityStatus(raw);
  switch (code) {
    case "P20":
      return "blue";
    case "P50":
      return "amber";
    case "P80":
      return "green";
    case "WON":
      return "indigo";
    default:
      return "zinc";
  }
}

export function opportunityStatusListForAi(locale: "zh" | "en" = "zh"): string {
  return OPPORTUNITY_STATUS_CODES.map(
    (c) => `${c}=${locale === "en" ? OPPORTUNITY_STATUS_LABELS_EN[c] : OPPORTUNITY_STATUS_LABELS_ZH[c]}`
  ).join(locale === "zh" ? "；" : "; ");
}
