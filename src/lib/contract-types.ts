/** Customer commercial contracts: subscription, buyout + product maint, project + project maint. */

import { parseAmountNumber } from "@/lib/amount";

export const CONTRACT_TYPE_CODES = [
  "SUBSCRIPTION",
  "BUYOUT",
  "PRODUCT_MAINTENANCE",
  "PROJECT",
  "PROJECT_MAINTENANCE",
] as const;
export type ContractTypeCode = (typeof CONTRACT_TYPE_CODES)[number];

export const CONTRACT_STATUS_CODES = ["DRAFT", "ACTIVE", "EXPIRED", "CANCELLED", "RENEWED"] as const;
export type ContractStatusCode = (typeof CONTRACT_STATUS_CODES)[number];

export const BILLING_CYCLE_CODES = ["MONTHLY", "QUARTERLY", "YEARLY", "OTHER"] as const;
export type BillingCycleCode = (typeof BILLING_CYCLE_CODES)[number];

/** Common rates embedded in buyout (product maint) or project contracts. */
export const MAINT_RATE_PRESETS = [15, 20] as const;

export const DEFAULT_CONTRACT_STATUS: ContractStatusCode = "ACTIVE";
export const DEFAULT_CONTRACT_TYPE: ContractTypeCode = "SUBSCRIPTION";
export const DEFAULT_PRODUCT_MAINT_RATE_PCT = 15;
export const DEFAULT_PROJECT_MAINT_RATE_PCT = 15;

/** @deprecated use DEFAULT_PRODUCT_MAINT_RATE_PCT */
export const DEFAULT_WEIBAO_RATE_PCT = DEFAULT_PRODUCT_MAINT_RATE_PCT;
/** @deprecated use MAINT_RATE_PRESETS */
export const WEIBAO_RATE_PRESETS = MAINT_RATE_PRESETS;

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

/** Main commercial contracts that do not use a recurring billing cycle field. */
export function isPrimaryCommercialType(type: ContractTypeCode | string | null | undefined): boolean {
  return type === "BUYOUT" || type === "PROJECT";
}

/** Renewal / add-on types that may link to a parent commercial contract. */
export function isRenewalMaintType(type: ContractTypeCode | string | null | undefined): boolean {
  return type === "PRODUCT_MAINTENANCE" || type === "PROJECT_MAINTENANCE";
}

export function expectedParentType(
  type: ContractTypeCode | string | null | undefined
): "BUYOUT" | "PROJECT" | null {
  if (type === "PRODUCT_MAINTENANCE") return "BUYOUT";
  if (type === "PROJECT_MAINTENANCE") return "PROJECT";
  return null;
}

export function normalizeContractType(raw: string | null | undefined): ContractTypeCode | null {
  if (!raw?.trim()) return null;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  // Legacy code from early contract PR
  if (upper === "MAINTENANCE") return "PRODUCT_MAINTENANCE";
  if (isContractTypeCode(upper)) return upper;
  if (/项目维保|project[_\s]?maint/i.test(raw)) return "PROJECT_MAINTENANCE";
  if (/产品维保|product[_\s]?maint|微宝|weibao/i.test(raw)) return "PRODUCT_MAINTENANCE";
  if (/项目合同|project\s*contract|^project$/i.test(raw)) return "PROJECT";
  if (/订阅|subscription|saas|recurring/i.test(raw)) return "SUBSCRIPTION";
  if (/维保|maintenance|support|ams/i.test(raw)) return "PRODUCT_MAINTENANCE";
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

/** Parse maintenance rate percent (1–100). Empty / invalid → null. */
export function normalizeMaintRatePct(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/%/g, "").trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 100) return null;
  return rounded;
}

/** @deprecated use normalizeMaintRatePct */
export const normalizeWeibaoRatePct = normalizeMaintRatePct;

/** Extract a numeric amount from free-text amount fields (e.g. "120,000 USD"). */
export function parseContractAmountNumber(amount: string | null | undefined): number | null {
  return parseAmountNumber(amount);
}

/** Suggested standalone maintenance amount = parent amount × rate%. */
export function estimateMaintAmount(
  parentAmount: string | null | undefined,
  ratePct: number | null | undefined
): string | null {
  const base = parseContractAmountNumber(parentAmount);
  const rate = normalizeMaintRatePct(ratePct);
  if (base == null || rate == null) return null;
  const value = (base * rate) / 100;
  if (!Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** @deprecated use estimateMaintAmount */
export const estimateWeibaoAmount = estimateMaintAmount;

/** English labels for UI selects / badges (shared map). */
export const CONTRACT_TYPE_LABELS: Record<ContractTypeCode, string> = {
  SUBSCRIPTION: "Subscription",
  BUYOUT: "Buyout",
  PRODUCT_MAINTENANCE: "Product maintenance",
  PROJECT: "Project contract",
  PROJECT_MAINTENANCE: "Project maintenance",
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
  BUYOUT: "买断",
  PRODUCT_MAINTENANCE: "产品维保",
  PROJECT: "项目合同",
  PROJECT_MAINTENANCE: "项目维保",
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
): "indigo" | "amber" | "blue" | "zinc" | "green" | "purple" {
  const code = normalizeContractType(raw);
  switch (code) {
    case "SUBSCRIPTION":
      return "indigo";
    case "BUYOUT":
      return "blue";
    case "PRODUCT_MAINTENANCE":
      return "amber";
    case "PROJECT":
      return "green";
    case "PROJECT_MAINTENANCE":
      return "purple";
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
