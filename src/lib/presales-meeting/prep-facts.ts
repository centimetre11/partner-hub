import "server-only";

import { db } from "../db";
import type { PrepFacts } from "./types";
import type { AgendaSubjectKind } from "./subject";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** 会前只读事实：待办 / 商务记录 / 项目工作记录（无 AI）；记录类仅近 2 周 */
export async function loadPrepFacts(opts: {
  subjectKind?: AgendaSubjectKind | string | null;
  customerId?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
  partnerId?: string | null;
}): Promise<PrepFacts> {
  const kind = (opts.subjectKind ?? "PROJECT") as AgendaSubjectKind;
  const customerId = opts.customerId ?? null;
  const projectId = opts.projectId ?? null;
  const opportunityId = opts.opportunityId ?? null;
  const partnerId = opts.partnerId ?? null;
  const since = new Date(Date.now() - TWO_WEEKS_MS);

  const todoOr: Record<string, unknown>[] = [];
  if (kind === "CUSTOMER" && customerId) {
    todoOr.push({ customerId });
  } else {
    if (projectId) todoOr.push({ projectId });
    if (opportunityId) todoOr.push({ opportunityId });
    if (customerId) todoOr.push({ customerId, projectId: null, opportunityId: null });
    if (partnerId) todoOr.push({ partnerId });
  }

  const recordWhere =
    kind === "PARTNER" && partnerId
      ? { partnerId, occurredAt: { gte: since } }
      : customerId
        ? { customerId, occurredAt: { gte: since } }
        : partnerId
          ? { partnerId, occurredAt: { gte: since } }
          : { id: "__none__" };

  const [todos, records, logs] = await Promise.all([
    todoOr.length
      ? db.todoItem.findMany({
          where: { status: "OPEN", OR: todoOr },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 30,
          select: {
            id: true,
            title: true,
            dueDate: true,
            assignee: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    db.businessRecord.findMany({
      where: recordWhere,
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
    projectId
      ? db.projectWorkLog.findMany({
          where: { projectId, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
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

/** 旧议程行补齐 subjectKind / subjectKey */
export async function backfillPresalesItemSubjects(meetingId?: string) {
  const rows = await db.presalesProjectMeetingItem.findMany({
    where: {
      ...(meetingId ? { meetingId } : {}),
      OR: [{ subjectKey: "" }, { subjectKey: { equals: "" } }],
    },
    select: {
      id: true,
      projectId: true,
      opportunityId: true,
      partnerId: true,
      customerId: true,
    },
  });
  for (const r of rows) {
    let kind: AgendaSubjectKind = "PROJECT";
    let id: string | null = r.projectId;
    if (r.opportunityId && !r.projectId) {
      kind = "OPPORTUNITY";
      id = r.opportunityId;
    } else if (r.partnerId && !r.projectId && !r.opportunityId) {
      kind = "PARTNER";
      id = r.partnerId;
    } else if (r.projectId) {
      kind = "PROJECT";
      id = r.projectId;
    } else if (r.customerId) {
      kind = "CUSTOMER";
      id = r.customerId;
    }
    if (!id) continue;
    const prefix =
      kind === "PROJECT"
        ? "project"
        : kind === "OPPORTUNITY"
          ? "opportunity"
          : kind === "PARTNER"
            ? "partner"
            : "customer";
    await db.presalesProjectMeetingItem.update({
      where: { id: r.id },
      data: { subjectKind: kind, subjectKey: `${prefix}:${id}` },
    });
  }
}
