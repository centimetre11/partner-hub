import "server-only";

import { db } from "../db";
import type { RecommendedAgendaItem } from "./types";
import { subjectKeyFor } from "./subject";
import { defaultFactsRangeDates, parseFactsRange } from "./facts-range";

type RecKind = RecommendedAgendaItem["kind"];

/**
 * 按所选同事 + 时间窗，取有商务记录 / 待办 / 项目工作记录的议程主体。
 * 商务记录可落到客户（不必有项目/商机）；有项目/商机时优先更具体主体。
 */
export async function recommendAgendaForUsers(
  userIds: string[],
  range?: { since?: string | null; until?: string | null },
): Promise<RecommendedAgendaItem[]> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];

  const { since, until } = parseFactsRange(
    range?.since,
    range?.until,
    defaultFactsRangeDates(),
  );

  const [records, todos, workLogs] = await Promise.all([
    db.businessRecord.findMany({
      where: {
        occurredAt: { gte: since, lte: until },
        customerId: { not: null },
        OR: [
          { createdById: { in: ids } },
          ...ids.map((id) => ({ crmRecorderUserIds: { contains: id } })),
        ],
      },
      select: {
        customerId: true,
        createdById: true,
        crmRecorderUserIds: true,
        customer: { select: { id: true, name: true } },
      },
      take: 200,
    }),
    db.todoItem.findMany({
      where: {
        assigneeId: { in: ids },
        OR: [
          { createdAt: { gte: since, lte: until } },
          { updatedAt: { gte: since, lte: until } },
        ],
      },
      select: {
        assigneeId: true,
        customerId: true,
        projectId: true,
        opportunityId: true,
        customer: { select: { id: true, name: true } },
        opportunity: {
          select: {
            id: true,
            name: true,
            customerId: true,
            customer: { select: { id: true, name: true } },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            customerId: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      take: 200,
    }),
    db.projectWorkLog.findMany({
      where: {
        authorId: { in: ids },
        createdAt: { gte: since, lte: until },
      },
      select: {
        authorId: true,
        projectId: true,
        project: {
          select: {
            id: true,
            name: true,
            customerId: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      take: 200,
    }),
  ]);

  type Acc = {
    userId: string;
    kind: RecKind;
    customerId: string | null;
    customerName: string | null;
    projectId: string | null;
    projectName: string | null;
    opportunityId: string | null;
    opportunityName: string | null;
    reasons: Set<string>;
  };
  const map = new Map<string, Acc>();
  const customerProjectCache = new Map<string, { id: string; name: string } | null>();
  const customerOppCache = new Map<string, { id: string; name: string } | null>();

  async function fallbackProject(customerId: string) {
    if (customerProjectCache.has(customerId)) return customerProjectCache.get(customerId)!;
    const proj = await db.project.findFirst({
      where: { customerId, status: { not: "CLOSED" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
    customerProjectCache.set(customerId, proj);
    return proj;
  }

  async function fallbackOpportunity(customerId: string) {
    if (customerOppCache.has(customerId)) return customerOppCache.get(customerId)!;
    const opp = await db.opportunity.findFirst({
      where: {
        customerId,
        status: { notIn: ["WON", "LOST"] },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
    customerOppCache.set(customerId, opp);
    return opp;
  }

  function touch(opts: {
    userId: string;
    kind: RecKind;
    customerId?: string | null;
    customerName?: string | null;
    projectId?: string | null;
    projectName?: string | null;
    opportunityId?: string | null;
    opportunityName?: string | null;
    reason: string;
  }) {
    if (!opts.userId) return;
    let id: string | null = null;
    if (opts.kind === "PROJECT") id = opts.projectId ?? null;
    else if (opts.kind === "OPPORTUNITY") id = opts.opportunityId ?? null;
    else if (opts.kind === "CUSTOMER") id = opts.customerId ?? null;
    else return;
    if (!id) return;

    const key = `${opts.userId}|${subjectKeyFor(opts.kind, id)}`;
    let row = map.get(key);
    if (!row) {
      row = {
        userId: opts.userId,
        kind: opts.kind,
        customerId: opts.customerId ?? null,
        customerName: opts.customerName ?? null,
        projectId: opts.projectId ?? null,
        projectName: opts.projectName ?? null,
        opportunityId: opts.opportunityId ?? null,
        opportunityName: opts.opportunityName ?? null,
        reasons: new Set(),
      };
      map.set(key, row);
    }
    row.reasons.add(opts.reason);
  }

  /** 商务记录：优先已有项目 → 商机 → 仅客户 */
  for (const r of records) {
    if (!r.customerId || !r.customer) continue;
    const credited = new Set<string>();
    if (r.createdById && ids.includes(r.createdById)) credited.add(r.createdById);
    if (r.crmRecorderUserIds) {
      for (const id of ids) {
        if (r.crmRecorderUserIds.includes(id)) credited.add(id);
      }
    }
    const proj = await fallbackProject(r.customerId);
    const opp = proj ? null : await fallbackOpportunity(r.customerId);
    for (const userId of credited) {
      if (proj) {
        touch({
          userId,
          kind: "PROJECT",
          customerId: r.customer.id,
          customerName: r.customer.name,
          projectId: proj.id,
          projectName: proj.name,
          reason: "商务记录",
        });
      } else if (opp) {
        touch({
          userId,
          kind: "OPPORTUNITY",
          customerId: r.customer.id,
          customerName: r.customer.name,
          opportunityId: opp.id,
          opportunityName: opp.name,
          reason: "商务记录",
        });
      } else {
        touch({
          userId,
          kind: "CUSTOMER",
          customerId: r.customer.id,
          customerName: r.customer.name,
          reason: "商务记录",
        });
      }
    }
  }

  for (const t of todos) {
    if (!t.assigneeId) continue;

    if (t.project?.customer) {
      touch({
        userId: t.assigneeId,
        kind: "PROJECT",
        customerId: t.project.customer.id,
        customerName: t.project.customer.name,
        projectId: t.project.id,
        projectName: t.project.name,
        reason: "待办",
      });
      continue;
    }

    if (t.opportunity) {
      touch({
        userId: t.assigneeId,
        kind: "OPPORTUNITY",
        customerId: t.opportunity.customer?.id ?? t.opportunity.customerId ?? t.customerId,
        customerName: t.opportunity.customer?.name ?? t.customer?.name ?? null,
        opportunityId: t.opportunity.id,
        opportunityName: t.opportunity.name,
        reason: "待办",
      });
      continue;
    }

    const customerId = t.customerId ?? t.project?.customerId ?? null;
    const customerName = t.customer?.name ?? t.project?.customer?.name ?? null;
    if (!customerId || !customerName) continue;

    if (t.project) {
      touch({
        userId: t.assigneeId,
        kind: "PROJECT",
        customerId,
        customerName,
        projectId: t.project.id,
        projectName: t.project.name,
        reason: "待办",
      });
      continue;
    }

    const proj = await fallbackProject(customerId);
    if (proj) {
      touch({
        userId: t.assigneeId,
        kind: "PROJECT",
        customerId,
        customerName,
        projectId: proj.id,
        projectName: proj.name,
        reason: "待办",
      });
      continue;
    }

    const opp = await fallbackOpportunity(customerId);
    if (opp) {
      touch({
        userId: t.assigneeId,
        kind: "OPPORTUNITY",
        customerId,
        customerName,
        opportunityId: opp.id,
        opportunityName: opp.name,
        reason: "待办",
      });
      continue;
    }

    touch({
      userId: t.assigneeId,
      kind: "CUSTOMER",
      customerId,
      customerName,
      reason: "待办",
    });
  }

  for (const log of workLogs) {
    const p = log.project;
    if (!p?.customer) continue;
    touch({
      userId: log.authorId,
      kind: "PROJECT",
      customerId: p.customer.id,
      customerName: p.customer.name,
      projectId: p.id,
      projectName: p.name,
      reason: "项目工作记录",
    });
  }

  return [...map.values()]
    .map((row) => {
      const subjectKey = subjectKeyFor(
        row.kind,
        row.kind === "PROJECT"
          ? row.projectId!
          : row.kind === "OPPORTUNITY"
            ? row.opportunityId!
            : row.customerId!,
      );
      const title =
        row.kind === "PROJECT"
          ? `${row.customerName ?? "—"} / ${row.projectName ?? "—"}`
          : row.kind === "OPPORTUNITY"
            ? `${row.customerName ?? "—"} / 商机 · ${row.opportunityName ?? "—"}`
            : `客户 · ${row.customerName ?? "—"}`;
      return {
        userId: row.userId,
        kind: row.kind,
        subjectKey,
        title,
        customerId: row.customerId,
        customerName: row.customerName,
        projectId: row.projectId,
        projectName: row.projectName,
        opportunityId: row.opportunityId,
        opportunityName: row.opportunityName,
        reasons: [...row.reasons],
      } satisfies RecommendedAgendaItem;
    })
    .sort((a, b) => {
      const u = a.userId.localeCompare(b.userId);
      if (u) return u;
      return a.title.localeCompare(b.title, "zh");
    });
}
