import { db } from "./db";

/**
 * Enforce two-level partner hierarchy only:
 * - parent must exist and must not itself have a parent
 * - child must not already have children (cannot become a sub if already a distributor)
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
    select: { id: true, parentId: true, name: true },
  });
  if (!parent) {
    return { ok: false, error: "Parent partner not found" };
  }
  if (parent.parentId) {
    return { ok: false, error: "Cannot attach under a sub-partner; only top-level distributors are allowed" };
  }

  if (childId) {
    const childCount = await db.partner.count({ where: { parentId: childId } });
    if (childCount > 0) {
      return { ok: false, error: "This partner already has sub-partners and cannot be attached under another" };
    }
  }

  return { ok: true };
}

/** Partners that can act as distributors (no parent of their own). */
export async function listDistributorCandidates(excludeId?: string) {
  return db.partner.findMany({
    where: {
      parentId: null,
      status: { in: ["ACTIVE", "PROSPECT"] },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
}
