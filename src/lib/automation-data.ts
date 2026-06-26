import { db } from "./db";
import { dueWithinDaysRange, overdueDueDateBefore } from "./todo-dates";
import type { AutomationQuery } from "./automation-query";

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

  return db.todoItem.findMany({
    where: {
      status: "OPEN",
      ...scopeWhere(query),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...dueWhere,
    },
    include: { partner: true, customer: true, assignee: true },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
}

/** 商机（结构化过滤：范围 + 状态） */
export async function queryOpportunities(query: AutomationQuery) {
  return db.opportunity.findMany({
    where: {
      ...scopeWhere(query),
      ...(query.opportunityStatus && query.opportunityStatus !== "ALL"
        ? { status: query.opportunityStatus }
        : {}),
    },
    include: { partner: true, customer: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}
