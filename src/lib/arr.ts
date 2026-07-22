/**
 * ARR (Annual Recurring Revenue) helpers.
 * Counts: product subscription, product maintenance, project maintenance.
 * Active buyouts with a product-maint rate also contribute implied product-maint ARR
 * until a linked ACTIVE PRODUCT_MAINTENANCE child exists.
 * All totals are converted to USD for reporting.
 */

import {
  type BillingCycleCode,
  type ContractTypeCode,
  isContractPastEnd,
  normalizeBillingCycle,
  normalizeContractStatus,
  normalizeContractType,
  parseContractAmountNumber,
} from "@/lib/contract-types";
import { toArrUsd } from "@/lib/arr-fx";

/** Classic recurring contract types that contribute to ARR. */
export const ARR_CONTRACT_TYPES = [
  "SUBSCRIPTION",
  "PRODUCT_MAINTENANCE",
  "PROJECT_MAINTENANCE",
] as const;
export type ArrContractType = (typeof ARR_CONTRACT_TYPES)[number];

const ARR_TYPE_SET = new Set<string>(ARR_CONTRACT_TYPES);

export function isArrContractType(type: string | null | undefined): type is ArrContractType {
  const code = normalizeContractType(type);
  return !!code && ARR_TYPE_SET.has(code);
}

/**
 * Prisma where: ACTIVE classic ARR types OR buyouts with product-maint rate.
 * Pair with {@link ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE} for buyout dedup.
 */
export function arrSourceContractWhere() {
  return {
    status: "ACTIVE" as const,
    OR: [
      { contractType: { in: [...ARR_CONTRACT_TYPES] } },
      { contractType: "BUYOUT", productMaintRatePct: { gt: 0 } },
    ],
  };
}

/** Include ACTIVE product-maint children (for buyout implied-ARR dedup). */
export const ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE = {
  childContracts: {
    where: { contractType: "PRODUCT_MAINTENANCE" as const, status: "ACTIVE" as const },
    select: { id: true },
    take: 1,
  },
};

/** Convert a contract amount + billing cycle into annualized value (native currency). */
export function annualizeContractAmount(
  amount: string | number | null | undefined,
  billingCycle: string | null | undefined
): number {
  const n = typeof amount === "number" ? amount : parseContractAmountNumber(amount);
  if (n == null || !Number.isFinite(n)) return 0;
  const cycle = normalizeBillingCycle(billingCycle);
  switch (cycle as BillingCycleCode | null) {
    case "MONTHLY":
      return n * 12;
    case "QUARTERLY":
      return n * 4;
    case "YEARLY":
    case "OTHER":
    default:
      return n;
  }
}

export type ArrLineItemInput = {
  amount?: string | null;
  currency?: string | null;
  cycleYears?: number | null;
};

export type ArrContractInput = {
  id: string;
  contractType: string;
  status: string;
  amount: string | null;
  currency?: string | null;
  billingCycle: string | null;
  /** Years the header amount covers; ARR divides by this when > 1. */
  termYears?: number | null;
  /** Buyout: embedded product-maintenance rate (e.g. 15). */
  productMaintRatePct?: number | null;
  /** True when an ACTIVE PRODUCT_MAINTENANCE child is linked (suppresses buyout implied ARR). */
  hasActiveProductMaintChild?: boolean;
  endDate: Date | string | null;
  renewsAt?: Date | string | null;
  startDate?: Date | string | null;
  name?: string;
  customerId?: string;
  lineItems?: ArrLineItemInput[] | null;
};

/** Normalize subscription term years; null/invalid → 1. */
export function normalizeTermYears(raw: number | string | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/**
 * Rough calendar term years from start→end (integer).
 * e.g. 2026-01-29 → 2030-12-31 ≈ 5.
 */
export function termYearsFromDateRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): number | null {
  if (!start || !end) return null;
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  const years = (e.getTime() - s.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(years) || years <= 0) return null;
  return normalizeTermYears(Math.max(1, Math.round(years)));
}

/**
 * Map Prisma row (+ optional childContracts) into ArrContractInput for ARR math.
 * When `hasActiveProductMaintChild` is set explicitly, it wins.
 * Otherwise, if `childContracts` came from {@link ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE},
 * any listed child means an active product-maint child exists.
 */
export function toArrContractInput(
  ct: ArrContractInput & { childContracts?: { id: string }[] | null }
): ArrContractInput {
  const hasChild =
    ct.hasActiveProductMaintChild !== undefined
      ? !!ct.hasActiveProductMaintChild
      : (ct.childContracts?.length ?? 0) > 0;
  return {
    id: ct.id,
    contractType: ct.contractType,
    status: ct.status,
    amount: ct.amount,
    currency: ct.currency,
    billingCycle: ct.billingCycle,
    termYears: ct.termYears,
    productMaintRatePct: ct.productMaintRatePct,
    hasActiveProductMaintChild: hasChild,
    endDate: ct.endDate,
    renewsAt: ct.renewsAt,
    startDate: ct.startDate,
    name: ct.name,
    customerId: ct.customerId,
    lineItems: ct.lineItems,
  };
}

/**
 * Buyout contributes implied product-maint ARR when ACTIVE, rate > 0,
 * not past end, and no ACTIVE product-maint child.
 */
export function isBuyoutImpliedArr(ct: ArrContractInput): boolean {
  if (normalizeContractType(ct.contractType) !== "BUYOUT") return false;
  if (normalizeContractStatus(ct.status) !== "ACTIVE") return false;
  if (isContractPastEnd(ct.endDate, ct.status)) return false;
  const rate = ct.productMaintRatePct;
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return false;
  if (ct.hasActiveProductMaintChild) return false;
  return true;
}

/** Whether a contract currently counts toward ARR. */
export function isActiveArrContract(ct: ArrContractInput): boolean {
  if (normalizeContractStatus(ct.status) !== "ACTIVE") return false;
  if (isContractPastEnd(ct.endDate, ct.status)) return false;
  if (isArrContractType(ct.contractType)) return true;
  return isBuyoutImpliedArr(ct);
}

/** Type used for ARR breakdown buckets (buyout implied → product maintenance). */
export function arrBreakdownType(ct: ArrContractInput): string {
  if (normalizeContractType(ct.contractType) === "BUYOUT") return "PRODUCT_MAINTENANCE";
  return ct.contractType;
}

/**
 * ARR contribution in USD.
 * - Classic types: header amount ÷ termYears (or line items).
 * - Buyout implied: amount × productMaintRatePct / 100 (until child maint exists).
 */
export function contractArrAmount(ct: ArrContractInput): number {
  if (!isActiveArrContract(ct)) return 0;

  if (isBuyoutImpliedArr(ct)) {
    const header = parseContractAmountNumber(ct.amount);
    if (header == null || header <= 0) return 0;
    const rate = ct.productMaintRatePct!;
    return toArrUsd((header * rate) / 100, ct.currency);
  }

  const header = parseContractAmountNumber(ct.amount);
  if (header != null && header > 0) {
    const years = normalizeTermYears(ct.termYears);
    const annual = annualizeContractAmount(header / years, ct.billingCycle);
    return toArrUsd(annual, ct.currency);
  }

  const lines = ct.lineItems ?? [];
  if (!lines.length) return 0;

  let usd = 0;
  for (const li of lines) {
    const raw = parseContractAmountNumber(li.amount);
    if (raw == null || raw <= 0) continue;
    const years = li.cycleYears && li.cycleYears > 0 ? li.cycleYears : 1;
    const annual = annualizeContractAmount(raw / years, ct.billingCycle);
    usd += toArrUsd(annual, li.currency ?? ct.currency);
  }
  return usd;
}

export type ArrBreakdown = {
  subscription: number;
  productMaintenance: number;
  projectMaintenance: number;
  total: number;
};

export function emptyArrBreakdown(): ArrBreakdown {
  return { subscription: 0, productMaintenance: 0, projectMaintenance: 0, total: 0 };
}

export function addToBreakdown(b: ArrBreakdown, type: ContractTypeCode | string, amount: number): void {
  const code = normalizeContractType(type);
  if (!code || amount === 0) return;
  if (code === "SUBSCRIPTION") b.subscription += amount;
  else if (code === "PRODUCT_MAINTENANCE") b.productMaintenance += amount;
  else if (code === "PROJECT_MAINTENANCE") b.projectMaintenance += amount;
  else if (code === "BUYOUT") b.productMaintenance += amount;
  b.total = b.subscription + b.productMaintenance + b.projectMaintenance;
}

export function sumArrBreakdown(contracts: ArrContractInput[]): ArrBreakdown {
  const b = emptyArrBreakdown();
  for (const ct of contracts) {
    const amt = contractArrAmount(ct);
    if (amt > 0) addToBreakdown(b, arrBreakdownType(ct), amt);
  }
  return b;
}

/** Latest service / renewal date hint from ARR contracts. */
export function latestServiceDateFromContracts(
  contracts: ArrContractInput[]
): Date | null {
  let latest: Date | null = null;
  for (const ct of contracts) {
    if (!isActiveArrContract(ct)) continue;
    for (const raw of [ct.renewsAt, ct.endDate]) {
      if (!raw) continue;
      const d = typeof raw === "string" ? new Date(raw) : raw;
      if (Number.isNaN(d.getTime())) continue;
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

export function formatArrNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : Math.min(digits, 2),
    maximumFractionDigits: digits,
  });
}

/** Format ARR in USD, e.g. $110,527 */
export function formatArrUsd(n: number, digits = 2): string {
  return `$${formatArrNumber(n, digits)}`;
}

export function arrTypeBucket(type: string | null | undefined): keyof Omit<ArrBreakdown, "total"> | null {
  const code = normalizeContractType(type);
  if (code === "SUBSCRIPTION") return "subscription";
  if (code === "PRODUCT_MAINTENANCE" || code === "BUYOUT") return "productMaintenance";
  if (code === "PROJECT_MAINTENANCE") return "projectMaintenance";
  return null;
}
