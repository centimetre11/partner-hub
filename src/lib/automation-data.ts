import { db } from "./db";
import { dueWithinDaysRange, overdueDueDateBefore } from "./todo-dates";
import type { AutomationQuery } from "./automation-query";
import { OPEN_OPPORTUNITY_STATUSES } from "./opportunity-status";

export type TodoRow = Awaited<ReturnType<typeof queryTodos>>[number];
export type OpportunityRow = Awaited<ReturnType<typeof queryOpportunities>>[number];

function scopeWhere(query: AutomationQuery): Record<string, unknown> {
  if (query.scope === "partner" && query.partnerId) return { partnerId: query.partnerId };
  if (query.scope === "customer" && query.customerId) return { customerId: query.customerId };
  return {};
}

/** OPEN 待办（结构化过滤：范围 + 负责人 + 到期） */
export async function queryTodos(query: AutomationQuery) {
  const dueWhere =
    query.dueFilter === "overdue"
      ? { dueDate: { lt: overdueDueDateBefore() } }
      : query.dueFilter === "within_days"
        ? (() => {
            const range = dueWithinDaysRange(query.dueWithinDays ?? 3);
            return range ? { dueDate: range } : {};
          })()
        : {};

  const linkWhere =
    query.linkFilter === "project"
      ? { projectId: { not: null } }
      : query.linkFilter === "opportunity"
        ? { opportunityId: { not: null } }
        : query.linkFilter === "unlinked"
          ? { projectId: null, opportunityId: null }
          : {};

  return db.todoItem.findMany({
    where: {
      status: "OPEN",
      ...scopeWhere(query),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...dueWhere,
      ...linkWhere,
    },
    include: {
      partner: true,
      customer: true,
      assignee: true,
      opportunity: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
}

/** 商机（结构化过滤：范围 + 状态 + 成交类型） */
export async function queryOpportunities(query: AutomationQuery) {
  const statusWhere =
    !query.opportunityStatus || query.opportunityStatus === "ALL"
      ? {}
      : query.opportunityStatus === "OPEN" || query.opportunityStatus === "ACTIVE"
        ? { status: { in: [...OPEN_OPPORTUNITY_STATUSES] } }
        : { status: query.opportunityStatus };

  return db.opportunity.findMany({
    where: {
      ...scopeWhere(query),
      ...statusWhere,
      ...(query.dealType && query.dealType !== "ALL" ? { dealType: query.dealType } : {}),
    },
    include: { partner: true, customer: true, project: { select: { id: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}
