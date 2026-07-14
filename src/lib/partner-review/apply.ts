import "server-only";

import { db } from "../db";
import { persistBusinessRecord } from "../business-record-core";
import type { ConfirmItemPayload } from "./types";

export type { ConfirmItemPayload } from "./types";

/** 人工确认后写入商务记录、MEETING 时间线、待办 */
export async function applyPartnerReviewConfirm(opts: {
  meetingId: string;
  userId: string;
  items: ConfirmItemPayload[];
}) {
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: opts.meetingId },
    include: {
      items: { include: { partner: { select: { id: true, name: true } }, todoDrafts: true } },
    },
  });
  if (!meeting) throw new Error("会议不存在");

  const results: { itemId: string; partnerName: string; todoCount: number; wroteRecord: boolean }[] = [];

  for (const payload of opts.items) {
    const item = meeting.items.find((i) => i.id === payload.itemId);
    if (!item) continue;

    let wroteRecord = false;
    if (!payload.skipBusinessRecord && payload.businessRecordTitle.trim()) {
      await persistBusinessRecord({
        owner: { kind: "partner", id: item.partnerId },
        userId: opts.userId,
        category: "RELATIONSHIP",
        title: payload.businessRecordTitle.trim(),
        content: payload.businessRecordContent?.trim() || payload.coreNotes?.trim() || null,
        occurredAt: meeting.endedAt ?? new Date(),
        source: "MANUAL",
      });
      wroteRecord = true;
    }

    await db.timelineEvent.create({
      data: {
        type: "MEETING",
        title: `过伙伴会议：${meeting.title}`,
        content: payload.coreNotes?.trim() || null,
        partnerId: item.partnerId,
        createdById: opts.userId,
        meta: JSON.stringify({
          via: "partner_review",
          meetingId: meeting.id,
          itemId: item.id,
        }),
      },
    });

    let todoCount = 0;
    for (const [idx, t] of payload.todos.entries()) {
      if (!t.include || !t.title.trim()) continue;
      const todo = await db.todoItem.create({
        data: {
          title: t.title.trim(),
          detail: t.detail?.trim() || null,
          partnerId: item.partnerId,
          assigneeId: t.assigneeId || opts.userId,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          priority: "MEDIUM",
          source: "AI",
          status: "OPEN",
        },
      });
      todoCount += 1;

      if (t.id) {
        await db.partnerReviewTodoDraft.update({
          where: { id: t.id },
          data: { confirmed: true, todoItemId: todo.id, title: t.title.trim(), detail: t.detail?.trim() || null },
        });
      } else {
        await db.partnerReviewTodoDraft.create({
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

    await db.partnerReviewItem.update({
      where: { id: item.id },
      data: {
        coreNotes: payload.coreNotes?.trim() || null,
        status: "CONFIRMED",
      },
    });

    results.push({ itemId: item.id, partnerName: item.partner.name, todoCount, wroteRecord });
  }

  const remaining = await db.partnerReviewItem.count({
    where: { meetingId: opts.meetingId, status: { not: "CONFIRMED" } },
  });
  if (remaining === 0) {
    await db.partnerReviewMeeting.update({
      where: { id: opts.meetingId },
      data: { status: "DONE", endedAt: meeting.endedAt ?? new Date() },
    });
  }

  return results;
}
