import { db } from "./db";

/**
 * Enforce two-level partner hierarchy only:
 * - parent must be an explicit Distributor (isDistributor) and must not itself have a parent
 * - child must not be a Distributor / must not already have children
 * - no self-reference
 */
export async function assertTwoLevelHierarchy(
  childId: string | null,
  parentId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!parentId) return { ok: true };
  if (childId && parentId === childId) {
    return { ok: false, error: "A partner cannot be its own parent" };
  }

  const parent = await db.partner.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true, isDistributor: true, name: true },
  });
  if (!parent) {
    return { ok: false, error: "Parent partner not found" };
  }
  if (!parent.isDistributor) {
    return { ok: false, error: "Parent must be marked as Distributor first" };
  }
  if (parent.parentId) {
    return { ok: false, error: "Cannot attach under a sub-partner; only Distributors are allowed" };
  }

  if (childId) {
    const child = await db.partner.findUnique({
      where: { id: childId },
      select: { isDistributor: true, _count: { select: { children: true } } },
    });
    if (child?.isDistributor || (child?._count.children ?? 0) > 0) {
      return { ok: false, error: "A Distributor cannot be attached under another partner" };
    }
  }

  return { ok: true };
}

/** Explicit Distributors that can receive sub-partners. */
export async function listDistributorCandidates(excludeId?: string) {
  return db.partner.findMany({
    where: {
      isDistributor: true,
      parentId: null,
      status: { in: ["ACTIVE", "PROSPECT"] },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
}
