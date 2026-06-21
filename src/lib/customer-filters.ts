/** Prisma where：排除伙伴自营影子档案，仅终端客户 */
export const END_CUSTOMER_WHERE = { partnerRelation: { not: "SELF" } } as const;

export function isEndCustomer(c: { partnerRelation: string | null }): boolean {
  return c.partnerRelation !== "SELF";
}

export function filterEndCustomers<T extends { partnerRelation: string | null }>(customers: T[]): T[] {
  return customers.filter(isEndCustomer);
}
