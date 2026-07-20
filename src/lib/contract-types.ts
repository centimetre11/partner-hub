/** Customer commercial contract types, statuses, billing cycles, and Weibao (buyout) rules. */

export const CONTRACT_TYPE_CODES = ["SUBSCRIPTION", "MAINTENANCE", "BUYOUT"] as const;
export type ContractTypeCode = (typeof CONTRACT_TYPE_CODES)[number];

export const CONTRACT_STATUS_CODES = ["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED", "RENEWED"] as const;
export type ContractStatusCode = (typeof CONTRACT_STATUS_CODES)[number];

export const BILLING_CYCLE_CODES = ["MONTHLY", "QUARTERLY", "YEARLY", "OTHER"] as const;
export type BillingCycleCode = (typeof BILLING_CYCLE_CODES)[number];

/** Common Weibao rates embedded in product buyout contracts. */
export const WEIBAO_RATE_PRESETS = [15, 20] as const;

export const DEFAULT_CONTRACT_STATUS: ContractStatusCode = "ACTIVE";
export const DEFAULT_CONTRACT_TYPE: ContractTypeCode = "SUBSCRIPTION";
export const DEFAULT_WEIBAO_RATE_PCT = 15;

const TYPE_SET = new Set<string>(CONTRACT_TYPE_CODES);
const STATUS_SET = new Set<string>(CONTRACT_STATUS_CODES);
const CYCLE_SET = new Set<string>(BILLING_CYCLE_CODES);

export function isContractTypeCode(value: string): value is ContractTypeCode {
  return TYPE_SET.has(value);
}

export function isContractStatusCode(value: string): value is ContractStatusCode {
  return STATUS_SET.has(value);
}

export function isBillingCycleCode(value: string): value is BillingCycleCode {
  return CYCLE_SET.has(value);
}

export function normalizeContractType(raw: string | null | undefined): ContractTypeCode | null {
  if (!raw?.trim()) return null;
  const upper = raw.trim().toUpperCase();
  if (isContractTypeCode(upper)) return upper;
  if (/订阅|subscription|saas|recurring/i.test(raw)) return "SUBSCRIPTION";
  if (/微宝|weibao|维保|maintenance|support|ams/i.test(raw)) return "MAINTENANCE";
  if (/买断|buyout|perpetual|one[- ]?time|license/i.test(raw)) return "BUYOUT";
  return null;
}

export function normalizeContractStatus(raw: string | null | undefined): ContractStatusCode {
  if (!raw?.trim()) return DEFAULT_CONTRACT_STATUS;
  const upper = raw.trim().toUpperCase();
  if (isContractStatusCode(upper)) return upper;
  if (/draft|草稿/i.test(raw)) return "DRAFT";
  if (/expired|到期|过期/i.test(raw)) return "EXPIRED";
  if (/cancel|取消|终止/i.test(raw)) return "CANCELLED";
  if (/renew|续约/i.test(raw)) return "RENEWED";
  if (/active|生效|有效/i.test(raw)) return "ACTIVE";
  return DEFAULT_CONTRACT_STATUS;
}

export function normalizeBillingCycle(raw: string | null | undefined): BillingCycleCode | null {
  if (!raw?.trim()) return null;
  const upper = raw.trim().toUpperCase();
  if (isBillingCycleCode(upper)) return upper;
  if (/month|月/i.test(raw)) return "MONTHLY";
  if (/quarter|季/i.test(raw)) return "QUARTERLY";
  if (/year|annual|年/i.test(raw)) return "YEARLY";
  return "OTHER";
}

/** Parse Weibao rate percent (1–100). Empty / invalid → null. */
export function normalizeWeibaoRatePct(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 100) return null;
  return rounded;
}

/** Extract a numeric amount from free-text amount fields (e.g. "120,000 USD"). */
export function parseContractAmountNumber(amount: string | null | undefined): number | null {
  if (!amount?.trim()) return null;
  const cleaned = amount.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : null;
}

/** Suggested standalone Weibao amount = buyout amount × rate%. */
export function estimateWeibaoAmount(
  buyoutAmount: string | null | undefined,
  ratePct: number | null | undefined
): string | null {
  const base = parseContractAmountNumber(buyoutAmount);
  const rate = normalizeWeibaoRatePct(ratePct);
  if (base == null || rate == null) return null;
  const value = (base * rate) / 100;
  if (!Number.isFinite(value)) return null;
  // Keep integers clean; otherwise 2 decimal places
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** English labels for UI selects / badges (shared map). */
export const CONTRACT_TYPE_LABELS: Record<ContractTypeCode, string> = {
  SUBSCRIPTION: "Subscription",
  MAINTENANCE: "Weibao",
  BUYOUT: "Buyout",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatusCode, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  RENEWED: "Renewed",
};

export const BILLING_CYCLE_LABELS: Record<BillingCycleCode, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  OTHER: "Other",
};

export const CONTRACT_TYPE_LABELS_ZH: Record<ContractTypeCode, string> = {
  SUBSCRIPTION: "订阅",
  MAINTENANCE: "微宝",
  BUYOUT: "买断",
};

export const CONTRACT_STATUS_LABELS_ZH: Record<ContractStatusCode, string> = {
  DRAFT: "草稿",
  ACTIVE: "生效",
  EXPIRED: "已到期",
  CANCELLED: "已取消",
  RENEWED: "已续约",
};

export const BILLING_CYCLE_LABELS_ZH: Record<BillingCycleCode, string> = {
  MONTHLY: "按月",
  QUARTERLY: "按季",
  YEARLY: "按年",
  OTHER: "其他",
};

export function contractTypeLabel(
  raw: string | null | undefined,
  locale: "zh" | "en" = "en"
): string {
  const code = normalizeContractType(raw);
  if (!code) return raw?.trim() || "—";
  return locale === "zh" ? CONTRACT_TYPE_LABELS_ZH[code] : CONTRACT_TYPE_LABELS[code];
}

export function contractStatusLabel(
  raw: string | null | undefined,
  locale: "zh" | "en" = "en"
): string {
  const code = normalizeContractStatus(raw);
  return locale === "zh" ? CONTRACT_STATUS_LABELS_ZH[code] : CONTRACT_STATUS_LABELS[code];
}

export function billingCycleLabel(
  raw: string | null | undefined,
  locale: "zh" | "en" = "en"
): string | null {
  const code = normalizeBillingCycle(raw);
  if (!code) return null;
  return locale === "zh" ? BILLING_CYCLE_LABELS_ZH[code] : BILLING_CYCLE_LABELS[code];
}

export function contractTypeTone(
  raw: string | null | undefined
): "indigo" | "amber" | "blue" | "zinc" {
  const code = normalizeContractType(raw);
  switch (code) {
    case "SUBSCRIPTION":
      return "indigo";
    case "MAINTENANCE":
      return "amber";
    case "BUYOUT":
      return "blue";
    default:
      return "zinc";
  }
}

export function contractStatusTone(
  raw: string | null | undefined
): "green" | "amber" | "red" | "zinc" | "indigo" {
  const code = normalizeContractStatus(raw);
  switch (code) {
    case "ACTIVE":
      return "green";
    case "DRAFT":
      return "zinc";
    case "EXPIRED":
      return "amber";
    case "CANCELLED":
      return "red";
    case "RENEWED":
      return "indigo";
    default:
      return "zinc";
  }
}

/** True when endDate is in the past (calendar day) and status is still ACTIVE. */
export function isContractPastEnd(
  endDate: Date | string | null | undefined,
  status: string | null | undefined
): boolean {
  if (!endDate) return false;
  if (normalizeContractStatus(status) !== "ACTIVE") return false;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  return endDay < today;
}
