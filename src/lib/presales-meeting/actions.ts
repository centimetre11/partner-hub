"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { db } from "../db";
import {
  parseTranscriptTextToTimedDoc,
  serializeTimedTranscriptDoc,
} from "../partner-review/transcript";
import { applyPresalesMeetingConfirm } from "./apply";
import type { ConfirmItemPayload } from "./types";
import { markItemDiscussed } from "./discuss-item";
import { materializeLiveNotesForMeeting } from "./notes-materialize";
import { markPrepReady, loadPrepFacts } from "./prep-facts";
import { recommendAgendaForUsers } from "./recommend";
import { buildSplitProposal, persistSplitDrafts } from "./split";
import { toMeetingClient } from "./meeting-client";
import {
  normalizeAgendaSubject,
  type AgendaSubjectInput,
  type AgendaSubjectKind,
} from "./subject";

export async function recommendPresalesAgendaAction(userIds: string[]) {
  await requireUser();
  try {
    const items = await recommendAgendaForUsers(userIds);
    return { ok: true as const, items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function revalidateMeeting(id: string) {
  revalidatePath("/presales-meetings");
  revalidatePath(`/presales-meetings/${id}`);
}

export async function createPresalesMeetingAction(input: {
  title?: string;
  scheduledAt?: string;
  attendeeUserIds?: string[];
  items: AgendaSubjectInput[];
}) {
  const user = await requireUser();
  const normalized = input.items
    .map((it) => normalizeAgendaSubject(it))
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!normalized.length) {
    return { error: "请至少添加一条议程（客户 / 项目 / 商机 / 伙伴）" };
  }

  // de-dupe by user + subjectKey
  const seen = new Set<string>();
  const items = normalized.filter((it) => {
    const key = `${it.userId}|${it.subjectKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const projectIds = [
    ...new Set(items.filter((i) => i.kind === "PROJECT").map((i) => i.projectId!)),
  ];
  const opportunityIds = [
    ...new Set(items.filter((i) => i.kind === "OPPORTUNITY").map((i) => i.opportunityId!)),
  ];
  const partnerIds = [
    ...new Set(items.filter((i) => i.kind === "PARTNER").map((i) => i.partnerId!)),
  ];
  const customerIds = [
    ...new Set(items.filter((i) => i.kind === "CUSTOMER").map((i) => i.customerId!)),
  ];

  const [projects, opportunities, partners, customers] = await Promise.all([
    projectIds.length
      ? db.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, customerId: true, partnerId: true },
        })
      : Promise.resolve([]),
    opportunityIds.length
      ? db.opportunity.findMany({
          where: { id: { in: opportunityIds } },
          select: { id: true, customerId: true, partnerId: true },
        })
      : Promise.resolve([]),
    partnerIds.length
      ? db.partner.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    customerIds.length
      ? db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const createRows: {
    userId: string;
    subjectKind: AgendaSubjectKind;
    subjectKey: string;
    customerId: string | null;
    projectId: string | null;
    opportunityId: string | null;
    partnerId: string | null;
    sortOrder: number;
  }[] = [];

  for (const [sortOrder, row] of items.entries()) {
    if (row.kind === "PROJECT") {
      const p = projects.find((x) => x.id === row.projectId);
      if (!p) return { error: "存在无效项目" };
      createRows.push({
        userId: row.userId,
        subjectKind: "PROJECT",
        subjectKey: row.subjectKey,
        customerId: p.customerId,
        projectId: p.id,
        opportunityId: null,
        partnerId: p.partnerId ?? null,
        sortOrder,
      });
      continue;
    }
    if (row.kind === "OPPORTUNITY") {
      const o = opportunities.find((x) => x.id === row.opportunityId);
      if (!o) return { error: "存在无效商机" };
      createRows.push({
        userId: row.userId,
        subjectKind: "OPPORTUNITY",
        subjectKey: row.subjectKey,
        customerId: o.customerId ?? null,
        projectId: null,
        opportunityId: o.id,
        partnerId: o.partnerId ?? null,
        sortOrder,
      });
      continue;
    }
    if (row.kind === "CUSTOMER") {
      const c = customers.find((x) => x.id === row.customerId);
      if (!c) return { error: "存在无效客户" };
      createRows.push({
        userId: row.userId,
        subjectKind: "CUSTOMER",
        subjectKey: row.subjectKey,
        customerId: c.id,
        projectId: null,
        opportunityId: null,
        partnerId: null,
        sortOrder,
      });
      continue;
    }
    const partner = partners.find((x) => x.id === row.partnerId);
    if (!partner) return { error: "存在无效伙伴" };
    createRows.push({
      userId: row.userId,
      subjectKind: "PARTNER",
      subjectKey: row.subjectKey,
      customerId: null,
      projectId: null,
      opportunityId: null,
      partnerId: partner.id,
      sortOrder,
    });
  }

  const title =
    input.title?.trim() || `售前项目会议 ${new Date().toLocaleDateString("zh-CN")}`;

  const meeting = await db.presalesProjectMeeting.create({
    data: {
      title,
      status: "DRAFT",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdById: user.id,
      attendeeUserIds: JSON.stringify(
        input.attendeeUserIds?.length
          ? input.attendeeUserIds
          : [...new Set(createRows.map((it) => it.userId))],
      ),
      items: { create: createRows },
    },
  });

  await markPrepReady(meeting.id);

  revalidatePath("/presales-meetings");
  revalidatePath(`/presales-meetings/${meeting.id}`);
  return { ok: true as const, id: meeting.id };
}

export async function runPresalesPrepAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting) return { error: "会议不存在" };
  await markPrepReady(meetingId);
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function loadItemPrepFactsAction(opts: {
  subjectKind?: string | null;
  customerId?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
  partnerId?: string | null;
}) {
  await requireUser();
  return { ok: true as const, facts: await loadPrepFacts(opts) };
}

export async function startPresalesMeetingAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };
  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: { status: "LIVE", startedAt: meeting.startedAt ?? new Date() },
  });
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function endPresalesMeetingAction(meetingId: string) {
  await requireUser();
  try {
    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: { status: "PROCESSING", endedAt: new Date() },
    });
    revalidateMeeting(meetingId);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 跳过 AI 提炼 / 入库核对，直接结束并进入历史 */
export async function finishPresalesMeetingWithoutExtractAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    select: { status: true, endedAt: true },
  });
  if (!meeting) return { error: "会议不存在" };
  if (meeting.status === "DONE") return { ok: true as const };

  await db.$transaction([
    db.presalesProjectMeetingItem.updateMany({
      where: { meetingId, status: { not: "CONFIRMED" } },
      data: { status: "CONFIRMED" },
    }),
    db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: {
        status: "DONE",
        endedAt: meeting.endedAt ?? new Date(),
      },
    }),
  ]);
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function resetPresalesMeetingToPrepAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting) return { error: "会议不存在" };
  if (meeting.status === "DONE") return { error: "已完成的历史会议不可重置" };
  if (meeting.status !== "PROCESSING" && meeting.status !== "LIVE") {
    return { error: "仅进行中或会后处理阶段可回到会前" };
  }

  await db.$transaction([
    db.presalesProjectMeetingTodoDraft.deleteMany({
      where: { item: { meetingId }, confirmed: false },
    }),
    db.presalesProjectMeetingItem.updateMany({
      where: { meetingId },
      data: {
        discussedAt: null,
        markerInsertedAt: null,
        status: "PENDING",
        coreNotes: null,
        confirmedSnapshot: null,
      },
    }),
    db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: {
        status: "PREP",
        startedAt: null,
        endedAt: null,
        transcriptText: null,
        transcriptJson: null,
        transcriptStatus: null,
        transcriptError: null,
        liveNotes: null,
        matchSource: null,
        tencentTranscriptText: null,
        tencentTranscriptJson: null,
        tencentLiveNotes: null,
        xfyunTranscriptText: null,
        xfyunTranscriptJson: null,
        xfyunLiveNotes: null,
        recordingPath: null,
        recordingMimeType: null,
        recordingBytes: null,
        recordingStartedAt: null,
        recordingEndedAt: null,
      },
    }),
  ]);

  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function discussPresalesItemAction(meetingId: string, itemId: string) {
  await requireUser();
  const res = await markItemDiscussed(meetingId, itemId);
  if ("error" in res) return { error: res.error };
  revalidateMeeting(meetingId);
  return {
    ok: true as const,
    label: res.label,
    discussedAt: res.discussedAt,
    relativeMs: res.relativeMs,
  };
}

/** 会中直接创建待办（立刻落库） */
export async function createLiveTodoAction(
  meetingId: string,
  itemId: string,
  input: { title: string; detail?: string; dueDate?: string; assigneeId?: string },
) {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) return { error: "请填写待办标题" };

  const item = await db.presalesProjectMeetingItem.findFirst({
    where: { id: itemId, meetingId },
    select: {
      customerId: true,
      projectId: true,
      opportunityId: true,
      partnerId: true,
      userId: true,
    },
  });
  if (!item) return { error: "议程项不存在" };

  const todo = await db.todoItem.create({
    data: {
      title,
      detail: input.detail?.trim() || null,
      customerId: item.customerId,
      projectId: item.projectId,
      opportunityId: item.opportunityId,
      partnerId: item.partnerId,
      assigneeId: input.assigneeId || item.userId || user.id,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      priority: "MEDIUM",
      source: "MANUAL",
      status: "OPEN",
    },
  });

  revalidateMeeting(meetingId);
  if (item.customerId) revalidatePath(`/customers/${item.customerId}`);
  if (item.partnerId) revalidatePath(`/partners/${item.partnerId}`);
  return { ok: true as const, todoId: todo.id };
}

export async function matchPresalesMinutesAction(meetingId: string, transcriptText: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    select: { startedAt: true, recordingStartedAt: true },
  });
  if (!meeting) return { error: "会议不存在" };

  const anchor = meeting.startedAt ?? meeting.recordingStartedAt ?? null;
  const timed = parseTranscriptTextToTimedDoc(transcriptText, { recordingStartedAt: anchor });
  const json = timed ? serializeTimedTranscriptDoc(timed) : null;

  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText,
      transcriptJson: json,
      tencentTranscriptText: transcriptText,
      tencentTranscriptJson: json,
      matchSource: "tencent",
      transcriptStatus: transcriptText.trim() ? "ready" : "idle",
      status: "PROCESSING",
    },
  });

  const { liveNotes, matchMethod } = await materializeLiveNotesForMeeting(meetingId);
  if (liveNotes) {
    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: { tencentLiveNotes: liveNotes },
    });
  }
  revalidateMeeting(meetingId);
  return { ok: true as const, liveNotes, matchMethod, matchSource: "tencent" as const };
}

export async function matchPresalesXfyunAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };
  const text = meeting.xfyunTranscriptText?.trim() || meeting.transcriptText?.trim();
  const json = meeting.xfyunTranscriptJson || meeting.transcriptJson;
  if (!text) return { error: "尚无讯飞转写，请先完成会中录音并转写" };

  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText: text,
      transcriptJson: json,
      matchSource: "xfyun",
      transcriptStatus: "ready",
      status: "PROCESSING",
    },
  });

  const { liveNotes, matchMethod } = await materializeLiveNotesForMeeting(meetingId);
  if (liveNotes) {
    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: { xfyunLiveNotes: liveNotes },
    });
  }
  revalidateMeeting(meetingId);
  return { ok: true as const, liveNotes, matchMethod, matchSource: "xfyun" as const };
}

export async function switchPresalesMatchSourceAction(
  meetingId: string,
  source: "tencent" | "xfyun",
) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };

  if (source === "tencent") {
    if (!meeting.tencentLiveNotes?.trim() && !meeting.tencentTranscriptText?.trim()) {
      return { error: "尚无腾讯纪要匹配结果" };
    }
    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: {
        matchSource: "tencent",
        transcriptText: meeting.tencentTranscriptText ?? meeting.transcriptText,
        transcriptJson: meeting.tencentTranscriptJson ?? meeting.transcriptJson,
        liveNotes: meeting.tencentLiveNotes ?? meeting.liveNotes,
      },
    });
  } else {
    if (!meeting.xfyunLiveNotes?.trim() && !meeting.xfyunTranscriptText?.trim()) {
      return { error: "尚无讯飞转写匹配结果" };
    }
    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: {
        matchSource: "xfyun",
        transcriptText: meeting.xfyunTranscriptText ?? meeting.transcriptText,
        transcriptJson: meeting.xfyunTranscriptJson ?? meeting.transcriptJson,
        liveNotes: meeting.xfyunLiveNotes ?? meeting.liveNotes,
      },
    });
  }
  revalidateMeeting(meetingId);
  return { ok: true as const, matchSource: source };
}

export async function savePresalesMatchedNotesAction(meetingId: string, liveNotes: string) {
  await requireUser();
  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function extractPresalesOutcomesAction(meetingId: string) {
  const user = await requireUser();
  try {
    const proposal = await buildSplitProposal(meetingId, user.id);
    await persistSplitDrafts(proposal);
    revalidateMeeting(meetingId);
    return { ok: true as const, proposal };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function confirmPresalesItemsAction(
  meetingId: string,
  items: ConfirmItemPayload[],
) {
  const user = await requireUser();
  try {
    const results = await applyPresalesMeetingConfirm({
      meetingId,
      userId: user.id,
      items,
    });
    revalidateMeeting(meetingId);
    revalidatePath("/customers");
    revalidatePath("/projects");
    return { ok: true as const, results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getPresalesMeetingClientAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          user: { select: { name: true } },
          customer: { select: { name: true } },
          project: { select: { name: true, phase: true } },
          opportunity: { select: { name: true } },
          partner: { select: { name: true } },
          todoDrafts: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!meeting) return { error: "会议不存在" };
  return { ok: true as const, meeting: toMeetingClient(meeting) };
}

/** 允许删除任意状态（含历史 DONE），便于清理测试数据 */
export async function deletePresalesMeetingAction(meetingId: string) {
  await requireUser();
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    select: { id: true },
  });
  if (!meeting) return { error: "会议不存在" };
  await db.presalesProjectMeeting.delete({ where: { id: meetingId } });
  revalidatePath("/presales-meetings");
  revalidatePath("/ops");
  return { ok: true as const };
}

