import "server-only";

import { db } from "../db";
import type { RecommendedAgendaItem } from "./types";

export type { RecommendedAgendaItem };

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * 按所选同事，取近 2 周有商务记录 / 待办 / 项目工作记录的客户+项目。
 */
export async function recommendAgendaForUsers(
  userIds: string[],
): Promise<RecommendedAgendaItem[]> {
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];

  const since = new Date(Date.now() - TWO_WEEKS_MS);

  const [records, todos, workLogs] = await Promise.all([
    db.businessRecord.findMany({
      where: {
        occurredAt: { gte: since },
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
        OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
      },
      select: {
        assigneeId: true,
        customerId: true,
        projectId: true,
        customer: { select: { id: true, name: true } },
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
        createdAt: { gte: since },
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
    customerId: string;
    customerName: string;
    projectId: string;
    projectName: string;
    reasons: Set<string>;
  };
  const map = new Map<string, Acc>();
  const customerProjectCache = new Map<string, { id: string; name: string } | null>();

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

  function touch(opts: {
    userId: string;
    customerId: string;
    customerName: string;
    projectId: string;
    projectName: string;
    reason: string;
  }) {
    if (!opts.userId || !opts.customerId || !opts.projectId) return;
    const key = `${opts.userId}|${opts.projectId}`;
    let row = map.get(key);
    if (!row) {
      row = {
        userId: opts.userId,
        customerId: opts.customerId,
        customerName: opts.customerName,
        projectId: opts.projectId,
        projectName: opts.projectName,
        reasons: new Set(),
      };
      map.set(key, row);
    }
    row.reasons.add(opts.reason);
  }

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
    if (!proj) continue;
    for (const userId of credited) {
      touch({
        userId,
        customerId: r.customer.id,
        customerName: r.customer.name,
        projectId: proj.id,
        projectName: proj.name,
        reason: "商务记录",
      });
    }
  }

  for (const t of todos) {
    if (!t.assigneeId) continue;

    if (t.project?.customer) {
      touch({
        userId: t.assigneeId,
        customerId: t.project.customer.id,
        customerName: t.project.customer.name,
        projectId: t.project.id,
        projectName: t.project.name,
        reason: "待办",
      });
      continue;
    }

    const customerId = t.customerId ?? t.project?.customerId ?? null;
    const customerName = t.customer?.name ?? null;
    if (!customerId || !customerName) continue;

    if (t.project) {
      touch({
        userId: t.assigneeId,
        customerId,
        customerName,
        projectId: t.project.id,
        projectName: t.project.name,
        reason: "待办",
      });
      continue;
    }

    const proj = await fallbackProject(customerId);
    if (!proj) continue;
    touch({
      userId: t.assigneeId,
      customerId,
      customerName,
      projectId: proj.id,
      projectName: proj.name,
      reason: "待办",
    });
  }

  for (const log of workLogs) {
    const p = log.project;
    if (!p?.customer) continue;
    touch({
      userId: log.authorId,
      customerId: p.customer.id,
      customerName: p.customer.name,
      projectId: p.id,
      projectName: p.name,
      reason: "项目工作记录",
    });
  }

  return [...map.values()]
    .map((row) => ({
      userId: row.userId,
      customerId: row.customerId,
      customerName: row.customerName,
      projectId: row.projectId,
      projectName: row.projectName,
      reasons: [...row.reasons],
    }))
    .sort((a, b) => {
      const u = a.userId.localeCompare(b.userId);
      if (u) return u;
      return a.customerName.localeCompare(b.customerName, "zh");
    });
}
