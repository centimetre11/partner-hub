/**
 * 客户三盘分类：基本盘 / 增长盘 / 机会盘 / 其他
 *
 * 规则（已确认）：
 * - 基本盘：status === "ACTIVE" 或存在有效 ARR 合同
 * - 增长盘：不在基本盘且存在推进中商机（P20/P50/P80），按最高概率分组
 * - 机会盘：不在基本盘/增长盘且 status === "PROSPECT" 的完全新客户
 * - 其他：INACTIVE 等未命中以上三类的情况，归入“全部”视图
 */

import { isActiveArrContract, type ArrContractInput } from "@/lib/arr";
import {
  isOpenOpportunityStatus,
  normalizeOpportunityStatus,
  type OpportunityStatusCode,
} from "@/lib/opportunity-status";

export type CustomerBucket = "base" | "growth" | "opportunity" | "other";
export type GrowthProbability = "P20" | "P50" | "P80";

export type CustomerBucketMeta = {
  bucket: CustomerBucket;
  /** 是否拥有有效 ARR 合同 */
  isArr: boolean;
  /** 推进中商机数量 */
  openOpportunityCount: number;
  /** 最高商机概率（用于增长盘分组，或在基本盘内打二次增长标签） */
  growthProbability: GrowthProbability | null;
  /** 是否存在推进中商机 */
  hasOpenOpportunities: boolean;
};

export type CustomerBucketInput = {
  id: string;
  status: string;
  contracts: ArrContractInput[];
  opportunities: { status: string | null }[];
};

export function classifyCustomer(customer: CustomerBucketInput): CustomerBucketMeta {
  const isArr = customer.contracts.some((ct) => isActiveArrContract(ct));
  const isBase = customer.status === "ACTIVE" || isArr;

  const openOpportunities = customer.opportunities.filter((o) =>
    isOpenOpportunityStatus(o.status ?? "")
  );
  const hasOpenOpportunities = openOpportunities.length > 0;
  const growthProbability = hasOpenOpportunities
    ? highestProbability(openOpportunities.map((o) => normalizeOpportunityStatus(o.status)))
    : null;

  let bucket: CustomerBucket;
  if (isBase) {
    bucket = "base";
  } else if (hasOpenOpportunities) {
    bucket = "growth";
  } else if (customer.status === "PROSPECT") {
    bucket = "opportunity";
  } else {
    bucket = "other";
  }

  return {
    bucket,
    isArr,
    openOpportunityCount: openOpportunities.length,
    growthProbability,
    hasOpenOpportunities,
  };
}

export function classifyCustomers<T extends CustomerBucketInput>(
  customers: T[]
): { customer: T; meta: CustomerBucketMeta }[] {
  return customers.map((customer) => ({
    customer,
    meta: classifyCustomer(customer),
  }));
}

function highestProbability(statuses: OpportunityStatusCode[]): GrowthProbability | null {
  const max = statuses.reduce((acc, s) => Math.max(acc, probabilityValue(s)), 0);
  if (max >= 80) return "P80";
  if (max >= 50) return "P50";
  if (max >= 20) return "P20";
  return null;
}

function probabilityValue(status: OpportunityStatusCode): number {
  switch (status) {
    case "P80":
      return 80;
    case "P50":
      return 50;
    case "P20":
      return 20;
    default:
      return 0;
  }
}
