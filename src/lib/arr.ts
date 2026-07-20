/**
 * ARR (Annual Recurring Revenue) helpers.
 * Counts: product subscription, product maintenance, project maintenance.
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

/** Contract types that contribute to ARR. */
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

/** Convert a contract amount + billing cycle into annualized value. */
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
      // Maintenance contracts without cycle are treated as yearly.
      return n;
  }
}

export type ArrContractInput = {
  id: string;
  contractType: string;
  status: string;
  amount: string | null;
  billingCycle: string | null;
  endDate: Date | string | null;
  renewsAt?: Date | string | null;
  startDate?: Date | string | null;
  name?: string;
  customerId?: string;
};

/** Whether a contract currently counts toward ARR. */
export function isActiveArrContract(ct: ArrContractInput): boolean {
  if (!isArrContractType(ct.contractType)) return false;
  if (normalizeContractStatus(ct.status) !== "ACTIVE") return false;
  if (isContractPastEnd(ct.endDate, ct.status)) return false;
  return true;
}

export function contractArrAmount(ct: ArrContractInput): number {
  if (!isActiveArrContract(ct)) return 0;
  return annualizeContractAmount(ct.amount, ct.billingCycle);
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
  b.total = b.subscription + b.productMaintenance + b.projectMaintenance;
}

export function sumArrBreakdown(contracts: ArrContractInput[]): ArrBreakdown {
  const b = emptyArrBreakdown();
  for (const ct of contracts) {
    const amt = contractArrAmount(ct);
    if (amt > 0) addToBreakdown(b, ct.contractType, amt);
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

export function arrTypeBucket(type: string | null | undefined): keyof Omit<ArrBreakdown, "total"> | null {
  const code = normalizeContractType(type);
  if (code === "SUBSCRIPTION") return "subscription";
  if (code === "PRODUCT_MAINTENANCE") return "productMaintenance";
  if (code === "PROJECT_MAINTENANCE") return "projectMaintenance";
  return null;
}
