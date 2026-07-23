import "server-only";

import { db } from "../db";
import type { PrepFacts } from "./types";

/** 会前只读事实：待办 / 商务记录 / 项目工作记录（无 AI） */
export async function loadPrepFacts(opts: {
  customerId: string;
  projectId: string;
}): Promise<PrepFacts> {
  const [todos, records, logs] = await Promise.all([
    db.todoItem.findMany({
      where: {
        status: "OPEN",
        OR: [{ projectId: opts.projectId }, { customerId: opts.customerId, projectId: null }],
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignee: { select: { name: true } },
      },
    }),
    db.businessRecord.findMany({
      where: { customerId: opts.customerId },
      orderBy: { occurredAt: "desc" },
      take: 15,
      select: {
        id: true,
        title: true,
        content: true,
        occurredAt: true,
        category: true,
      },
    }),
    db.projectWorkLog.findMany({
      where: { projectId: opts.projectId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    }),
  ]);

  return {
    openTodos: todos.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      assigneeName: t.assignee?.name ?? null,
    })),
    businessRecords: records.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      occurredAt: r.occurredAt.toISOString(),
      category: r.category,
    })),
    workLogs: logs.map((l) => ({
      id: l.id,
      content: l.content,
      createdAt: l.createdAt.toISOString(),
      authorName: l.author?.name ?? null,
    })),
  };
}

export async function markPrepReady(meetingId: string) {
  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: {
      status: "PREP",
      prepGeneratedAt: new Date(),
    },
  });
}
