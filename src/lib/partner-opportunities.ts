import type { Prisma } from "@prisma/client";
import { OPEN_OPPORTUNITY_STATUSES } from "@/lib/opportunity-status";

export const OPEN_OPPORTUNITY_STATUS_WHERE = {
  status: { in: [...OPEN_OPPORTUNITY_STATUSES] },
} as const satisfies Prisma.OpportunityWhereInput;

/** 伙伴直连商机 + 关联客户上的商机 */
export function partnerRelatedOpportunityWhere(partnerId: string): Prisma.OpportunityWhereInput {
  return {
    ...OPEN_OPPORTUNITY_STATUS_WHERE,
    OR: [
      { partnerId },
      { customer: { partnerLinks: { some: { partnerId } } } },
    ],
  };
}

export function partnersRelatedOpportunityWhere(partnerIds: string[]): Prisma.OpportunityWhereInput {
  if (partnerIds.length === 0) return { id: "__none__" };
  return {
    ...OPEN_OPPORTUNITY_STATUS_WHERE,
    OR: [
      { partnerId: { in: partnerIds } },
      { customer: { partnerLinks: { some: { partnerId: { in: partnerIds } } } } },
    ],
  };
}

type IndexedOpportunity = {
  name: string;
  updatedAt: Date;
  partnerId: string | null;
  customer: { partnerLinks: { partnerId: string }[] } | null;
};

export function indexOpenOpportunitiesByPartner<T extends IndexedOpportunity>(
  opportunities: T[],
  partnerIds: string[],
): Map<string, T[]> {
  const idSet = new Set(partnerIds);
  const map = new Map<string, T[]>(partnerIds.map((id) => [id, []]));

  for (const opp of opportunities) {
    const related = new Set<string>();
    if (opp.partnerId && idSet.has(opp.partnerId)) related.add(opp.partnerId);
    for (const link of opp.customer?.partnerLinks ?? []) {
      if (idSet.has(link.partnerId)) related.add(link.partnerId);
    }
    for (const pid of related) {
      map.get(pid)!.push(opp);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return map;
}
