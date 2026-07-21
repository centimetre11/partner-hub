export const LEAD_REVIEW_VERDICTS = ["QUALITY", "DIGESTION", "NORMAL", "WATCH"] as const;
export type LeadReviewVerdict = (typeof LEAD_REVIEW_VERDICTS)[number];

export const LEAD_REVIEW_SOURCES = ["CHANNEL", "NURTURE"] as const;
export type LeadReviewSource = (typeof LEAD_REVIEW_SOURCES)[number];

export type LeadReviewConfig = {
  salesmanNames: string[];
  /** empty = all salesmen */
  allSalesmen: boolean;
  channelCount: number;
  nurtureCount: number;
  includeChannelCustomer: boolean;
};

export const DEFAULT_LEAD_REVIEW_CONFIG: LeadReviewConfig = {
  salesmanNames: [],
  allSalesmen: true,
  channelCount: 20,
  nurtureCount: 10,
  includeChannelCustomer: false,
};

export const LAST_CONFIG_KEY = "lead_review_last_config";

export function parseLeadReviewConfig(raw: string | null | undefined): LeadReviewConfig {
  if (!raw?.trim()) return { ...DEFAULT_LEAD_REVIEW_CONFIG };
  try {
    const j = JSON.parse(raw) as Partial<LeadReviewConfig>;
    const salesmanNames = Array.isArray(j.salesmanNames)
      ? j.salesmanNames.map(String).filter(Boolean)
      : [];
    const allSalesmen = j.allSalesmen === true || salesmanNames.length === 0;
    return {
      salesmanNames: allSalesmen ? [] : salesmanNames,
      allSalesmen,
      channelCount: clampCount(j.channelCount, DEFAULT_LEAD_REVIEW_CONFIG.channelCount),
      nurtureCount: clampCount(j.nurtureCount, DEFAULT_LEAD_REVIEW_CONFIG.nurtureCount),
      includeChannelCustomer: Boolean(j.includeChannelCustomer),
    };
  } catch {
    return { ...DEFAULT_LEAD_REVIEW_CONFIG };
  }
}

function clampCount(n: unknown, fallback: number) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(50, Math.floor(v)));
}

export function normalizeConfig(input: Partial<LeadReviewConfig>): LeadReviewConfig {
  const salesmanNames = (input.salesmanNames ?? []).map((s) => s.trim()).filter(Boolean);
  const allSalesmen = input.allSalesmen === true || salesmanNames.length === 0;
  return {
    salesmanNames: allSalesmen ? [] : salesmanNames,
    allSalesmen,
    channelCount: clampCount(input.channelCount, 0),
    nurtureCount: clampCount(input.nurtureCount, 0),
    includeChannelCustomer: Boolean(input.includeChannelCustomer),
  };
}

export function isLeadReviewVerdict(v: string | null | undefined): v is LeadReviewVerdict {
  return !!v && (LEAD_REVIEW_VERDICTS as readonly string[]).includes(v);
}
