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
import { recommendAgendaForUsers, type RecommendedAgendaItem } from "./recommend";
import { buildSplitProposal, persistSplitDrafts } from "./split";
import { toMeetingClient, toMeetingItemClient } from "./meeting-client";

export type { RecommendedAgendaItem };

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
  items: { userId: string; customerId: string; projectId: string }[];
}) {
  const user = await requireUser();
  const items = input.items.filter((it) => it.userId && it.customerId && it.projectId);
  if (!items.length) return { error: "请至少添加一条议程（同事 + 客户 + 项目）" };

  const projectIds = [...new Set(items.map((i) => i.projectId))];
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, customerId: true },
  });
  for (const row of items) {
    const p = projects.find((x) => x.id === row.projectId);
    if (!p) return { error: "存在无效项目" };
    if (p.customerId !== row.customerId) return { error: "项目与客户不匹配" };
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
          : [...new Set(items.map((it) => it.userId))],
      ),
      items: {
        create: items.map((it, sortOrder) => ({
          userId: it.userId,
          customerId: it.customerId,
          projectId: it.projectId,
          sortOrder,
        })),
      },
    },
  });

  // 最终确认：拉起会前事实（无 AI）
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

export async function loadItemPrepFactsAction(customerId: string, projectId: string) {
  await requireUser();
  return { ok: true as const, facts: await loadPrepFacts({ customerId, projectId }) };
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
    select: { customerId: true, projectId: true, userId: true },
  });
  if (!item) return { error: "议程项不存在" };

  const todo = await db.todoItem.create({
    data: {
      title,
      detail: input.detail?.trim() || null,
      customerId: item.customerId,
      projectId: item.projectId,
      assigneeId: input.assigneeId || item.userId || user.id,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      priority: "MEDIUM",
      source: "MANUAL",
      status: "OPEN",
    },
  });

  revalidateMeeting(meetingId);
  revalidatePath(`/customers/${item.customerId}`);
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
          todoDrafts: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!meeting) return { error: "会议不存在" };
  return { ok: true as const, meeting: toMeetingClient(meeting) };
}

export type { ConfirmItemPayload };
export { toMeetingItemClient };
