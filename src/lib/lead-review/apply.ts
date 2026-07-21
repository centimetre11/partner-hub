import { db } from "../db";
import { isLeadReviewVerdict, type LeadReviewVerdict } from "./types";

export type ConfirmLeadItemPayload = {
  itemId: string;
  verdict: LeadReviewVerdict;
  coreNotes: string;
  todos: { id?: string; title: string; detail?: string; include: boolean; dueDate?: string }[];
};

export async function applyLeadReviewConfirm(opts: {
  meetingId: string;
  userId: string;
  items: ConfirmLeadItemPayload[];
}) {
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: opts.meetingId },
    include: { items: { include: { todoDrafts: true } } },
  });
  if (!meeting) throw new Error("会议不存在");

  const results: { itemId: string; name: string; todoCount: number }[] = [];

  for (const payload of opts.items) {
    const item = meeting.items.find((i) => i.id === payload.itemId);
    if (!item || item.status === "CONFIRMED") continue;
    if (!isLeadReviewVerdict(payload.verdict)) {
      throw new Error(`请为「${item.displayName ?? item.id}」选择结论标签`);
    }

    let todoCount = 0;
    const confirmedTodos: { title: string; detail: string | null; todoItemId: string }[] = [];

    for (const [idx, t] of payload.todos.entries()) {
      if (!t.include || !t.title.trim()) continue;
      const todo = await db.todoItem.create({
        data: {
          title: t.title.trim(),
          detail: t.detail?.trim() || null,
          assigneeId: opts.userId,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          priority: "MEDIUM",
          source: "AI",
          status: "OPEN",
        },
      });
      todoCount += 1;
      confirmedTodos.push({
        title: t.title.trim(),
        detail: t.detail?.trim() || null,
        todoItemId: todo.id,
      });
      if (t.id) {
        await db.leadReviewTodoDraft.update({
          where: { id: t.id },
          data: {
            confirmed: true,
            todoItemId: todo.id,
            title: t.title.trim(),
            detail: t.detail?.trim() || null,
          },
        });
      } else {
        await db.leadReviewTodoDraft.create({
          data: {
            itemId: item.id,
            title: t.title.trim(),
            detail: t.detail?.trim() || null,
            assigneeId: opts.userId,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            confirmed: true,
            todoItemId: todo.id,
            sortOrder: idx,
          },
        });
      }
    }

    const snapshot = {
      confirmedAt: new Date().toISOString(),
      verdict: payload.verdict,
      coreNotes: payload.coreNotes?.trim() || "",
      todos: confirmedTodos,
    };

    await db.leadReviewItem.update({
      where: { id: item.id },
      data: {
        verdict: payload.verdict,
        coreNotes: payload.coreNotes?.trim() || null,
        confirmedSnapshot: JSON.stringify(snapshot),
        status: "CONFIRMED",
      },
    });

    results.push({
      itemId: item.id,
      name: item.displayName ?? item.id,
      todoCount,
    });
  }

  const remaining = await db.leadReviewItem.count({
    where: { meetingId: opts.meetingId, status: { not: "CONFIRMED" } },
  });
  if (remaining === 0) {
    await db.leadReviewMeeting.update({
      where: { id: opts.meetingId },
      data: { status: "DONE", endedAt: meeting.endedAt ?? new Date() },
    });
  }

  return results;
}

export function summarizeVerdicts(
  items: { source: string; verdict: string | null }[],
) {
  const empty = { QUALITY: 0, DIGESTION: 0, NORMAL: 0, WATCH: 0, unset: 0 };
  const bySource = {
    CHANNEL: { ...empty },
    NURTURE: { ...empty },
    ALL: { ...empty },
  };

  for (const item of items) {
    const src = item.source === "NURTURE" ? "NURTURE" : "CHANNEL";
    const key = isLeadReviewVerdict(item.verdict) ? item.verdict : "unset";
    bySource[src][key] += 1;
    bySource.ALL[key] += 1;
  }
  return bySource;
}
