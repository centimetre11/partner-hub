import type { Partner, Prisma } from "@prisma/client";
import { db } from "./db";

export type PoolReviewPhase = "pending_contact" | "pending_decision";

const TIER_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };

export function sortPoolReviewCandidates<T extends Pick<Partner, "tier" | "fitScore" | "name">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = TIER_RANK[(a.tier ?? "").toUpperCase()] ?? 9;
    const tb = TIER_RANK[(b.tier ?? "").toUpperCase()] ?? 9;
    if (ta !== tb) return ta - tb;
    const fa = a.fitScore ?? -1;
    const fb = b.fitScore ?? -1;
    if (fa !== fb) return fb - fa;
    return a.name.localeCompare(b.name);
  });
}

// 扫库审阅覆盖「伙伴库」里所有候选（PROSPECT），用 poolContactedAt 作为「已扫/已联络」标记，与 poolFlag 无关。
// 待联络：还没扫到（未标记已联络）。已决策：已扫且仍是 NEW（尚未转正/观察/放弃）。
export function poolReviewWhere(phase: PoolReviewPhase): Prisma.PartnerWhereInput {
  if (phase === "pending_contact") return { status: "PROSPECT", poolContactedAt: null };
  return { status: "PROSPECT", poolFlag: "NEW", poolContactedAt: { not: null } };
}

// 已处理：已扫且已有明确去向（转正 / 观察 / 放弃 / 推进中）。
export const POOL_REVIEW_PROCESSED_WHERE: Prisma.PartnerWhereInput = {
  OR: [
    { status: "ACTIVE" },
    { status: "PROSPECT", poolContactedAt: { not: null }, poolFlag: { in: ["WATCHING", "DROPPED", "ADVANCING"] } },
  ],
};

export function poolReviewListFilter(
  review: string | undefined,
  view: "prospect" | "archived" | "all" = "prospect",
): Prisma.PartnerWhereInput | null {
  if (review === "pending_contact") return poolReviewWhere("pending_contact");
  if (review === "contacted") return poolReviewWhere("pending_decision");
  if (review === "processed") {
    if (view === "prospect") {
      return { status: "PROSPECT", poolContactedAt: { not: null }, poolFlag: { in: ["WATCHING", "DROPPED", "ADVANCING"] } };
    }
    return POOL_REVIEW_PROCESSED_WHERE;
  }
  return null;
}

export async function getPoolReviewCounts() {
  const [pendingContact, pendingDecision, processed] = await Promise.all([
    db.partner.count({ where: poolReviewWhere("pending_contact") }),
    db.partner.count({ where: poolReviewWhere("pending_decision") }),
    db.partner.count({ where: POOL_REVIEW_PROCESSED_WHERE }),
  ]);
  return { pendingContact, pendingDecision, processed, pendingTotal: pendingContact + pendingDecision };
}

const partnerReviewInclude = {
  contacts: { select: { role: true, contactInfo: true }, take: 3 },
  opportunities: { select: { id: true }, take: 1 },
  events: { select: { createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  trainings: { select: { id: true }, take: 1 },
} satisfies Prisma.PartnerInclude;

export type PoolReviewPartner = Prisma.PartnerGetPayload<{ include: typeof partnerReviewInclude }>;

export async function getNextPoolReviewPartner(skipIds: string[]): Promise<{
  partner: PoolReviewPartner;
  phase: PoolReviewPhase;
} | null> {
  for (const phase of ["pending_contact", "pending_decision"] as const) {
    const rows = await db.partner.findMany({
      where: {
        ...poolReviewWhere(phase),
        ...(skipIds.length ? { id: { notIn: skipIds } } : {}),
      },
      include: partnerReviewInclude,
    });
    const sorted = sortPoolReviewCandidates(rows);
    if (sorted[0]) return { partner: sorted[0], phase };
  }
  return null;
}

// 明细表：一次取出全部待审阅候选（待联络在前，其次待决策），每条带阶段标记。
export async function getPoolReviewQueue(): Promise<
  { partner: PoolReviewPartner; phase: PoolReviewPhase }[]
> {
  const queue: { partner: PoolReviewPartner; phase: PoolReviewPhase }[] = [];
  for (const phase of ["pending_contact", "pending_decision"] as const) {
    const rows = await db.partner.findMany({
      where: poolReviewWhere(phase),
      include: partnerReviewInclude,
    });
    for (const partner of sortPoolReviewCandidates(rows)) {
      queue.push({ partner, phase });
    }
  }
  return queue;
}
