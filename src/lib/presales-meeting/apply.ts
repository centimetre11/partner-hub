import "server-only";

import { db } from "../db";
import { persistBusinessRecord } from "../business-record-core";
import type { ConfirmItemPayload, ConfirmedItemSnapshot } from "./types";

export async function applyPresalesMeetingConfirm(opts: {
  meetingId: string;
  userId: string;
  items: ConfirmItemPayload[];
}) {
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: opts.meetingId },
    include: {
      items: {
        include: {
          customer: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          opportunity: { select: { id: true, name: true } },
          partner: { select: { id: true, name: true } },
          todoDrafts: true,
        },
      },
    },
  });
  if (!meeting) throw new Error("会议不存在");

  const results: {
    itemId: string;
    label: string;
    todoCount: number;
    wroteRecord: boolean;
    wroteWorkLog: boolean;
  }[] = [];

  for (const payload of opts.items) {
    const item = meeting.items.find((i) => i.id === payload.itemId);
    if (!item || item.status === "CONFIRMED") continue;

    let wroteRecord = false;
    if (!payload.skipBusinessRecord && payload.businessRecordTitle.trim()) {
      const owner =
        item.customerId
          ? ({ kind: "customer" as const, id: item.customerId })
          : item.partnerId
            ? ({ kind: "partner" as const, id: item.partnerId })
            : null;
      if (owner) {
        await persistBusinessRecord({
          owner,
          userId: opts.userId,
          category: "OTHER",
          title: payload.businessRecordTitle.trim(),
          content: payload.businessRecordContent?.trim() || payload.coreNotes?.trim() || null,
          occurredAt: meeting.endedAt ?? new Date(),
          source: "MANUAL",
        });
        wroteRecord = true;
      }
    }

    let wroteWorkLog = false;
    const workLog = payload.projectWorkLogContent?.trim() || payload.coreNotes?.trim();
    if (!payload.skipProjectWorkLog && workLog && item.projectId) {
      await db.projectWorkLog.create({
        data: {
          projectId: item.projectId,
          authorId: opts.userId,
          content: workLog,
        },
      });
      wroteWorkLog = true;
    }

    await db.timelineEvent.create({
      data: {
        type: "MEETING",
        title: `售前项目会议：${meeting.title}`,
        content: payload.coreNotes?.trim() || null,
        customerId: item.customerId,
        partnerId: item.partnerId,
        createdById: opts.userId,
        meta: JSON.stringify({
          via: "presales_project_meeting",
          meetingId: meeting.id,
          itemId: item.id,
          subjectKind: item.subjectKind,
          projectId: item.projectId,
          opportunityId: item.opportunityId,
          partnerId: item.partnerId,
        }),
      },
    });

    const confirmedTodos: ConfirmedItemSnapshot["todos"] = [];
    let todoCount = 0;
    for (const [idx, t] of payload.todos.entries()) {
      if (!t.include || !t.title.trim()) continue;
      const todo = await db.todoItem.create({
        data: {
          title: t.title.trim(),
          detail: t.detail?.trim() || null,
          customerId: item.customerId,
          projectId: item.projectId,
          opportunityId: item.opportunityId,
          partnerId: item.partnerId,
          assigneeId: t.assigneeId || item.userId || opts.userId,
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
        dueDate: t.dueDate || null,
        todoItemId: todo.id,
      });

      if (t.id) {
        await db.presalesProjectMeetingTodoDraft.update({
          where: { id: t.id },
          data: {
            confirmed: true,
            todoItemId: todo.id,
            title: t.title.trim(),
            detail: t.detail?.trim() || null,
          },
        });
      } else {
        await db.presalesProjectMeetingTodoDraft.create({
          data: {
            itemId: item.id,
            title: t.title.trim(),
            detail: t.detail?.trim() || null,
            assigneeId: t.assigneeId || opts.userId,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            confirmed: true,
            todoItemId: todo.id,
            sortOrder: idx,
          },
        });
      }
    }

    const snapshot: ConfirmedItemSnapshot = {
      confirmedAt: new Date().toISOString(),
      coreNotes: payload.coreNotes?.trim() || "",
      businessRecordTitle: payload.businessRecordTitle.trim(),
      businessRecordContent: payload.businessRecordContent?.trim() || "",
      skipBusinessRecord: !!payload.skipBusinessRecord,
      wroteBusinessRecord: wroteRecord,
      projectWorkLogContent: payload.projectWorkLogContent?.trim() || "",
      skipProjectWorkLog: !!payload.skipProjectWorkLog || !item.projectId,
      wroteProjectWorkLog: wroteWorkLog,
      todos: confirmedTodos,
    };

    await db.presalesProjectMeetingItem.update({
      where: { id: item.id },
      data: {
        status: "CONFIRMED",
        coreNotes: payload.coreNotes?.trim() || null,
        confirmedSnapshot: JSON.stringify(snapshot),
      },
    });

    results.push({
      itemId: item.id,
      label: item.project?.name || item.opportunity?.name || item.partner?.name || item.id,
      todoCount,
      wroteRecord,
      wroteWorkLog,
    });
  }

  const remaining = await db.presalesProjectMeetingItem.count({
    where: { meetingId: opts.meetingId, status: { not: "CONFIRMED" } },
  });
  if (remaining === 0) {
    await db.presalesProjectMeeting.update({
      where: { id: opts.meetingId },
      data: { status: "DONE" },
    });
  }

  return { results, allDone: remaining === 0 };
}
