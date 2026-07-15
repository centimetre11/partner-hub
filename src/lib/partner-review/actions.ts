"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { db } from "../db";
import { generateMeetingPrepBriefs, buildPartnerPrepBrief } from "./brief";
import { buildSplitProposal, persistSplitDrafts } from "./split";
import { applyPartnerReviewConfirm, type ConfirmItemPayload } from "./apply";
import { downloadDingDriveTranscript, fetchConferenceTranscript } from "../dingtalk/drive";
import {
  parseTranscriptTextToTimedDoc,
  serializeTimedTranscriptDoc,
} from "./transcript";
import { materializeLiveNotesForMeeting } from "./notes-materialize";
import { ensureMeetingPreviewToken, newPreviewToken } from "./preview-token";
import { markPartnerDiscussed } from "./discuss-partner";
import { matchMinutesToPartners } from "./minutes-match";
import { toReviewItemClient, type ReviewItemClient } from "./meeting-client";

function revalidateMeeting(id: string) {
  revalidatePath("/partner-reviews");
  revalidatePath(`/partner-reviews/${id}`);
  revalidatePath("/settings");
}

export async function createPartnerReviewMeetingAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim() || `过伙伴会议 ${new Date().toLocaleDateString("zh-CN")}`;
  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();
  const partnerIds = formData
    .getAll("partnerIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!partnerIds.length) return { error: "请至少选择一个伙伴" };

  const partners = await db.partner.findMany({
    where: { id: { in: partnerIds }, status: "ACTIVE" },
    select: { id: true },
  });
  if (!partners.length) return { error: "未找到有效的正式伙伴" };

  const orderedIds = partnerIds.filter((id) => partners.some((p) => p.id === id));

  const meeting = await db.partnerReviewMeeting.create({
    data: {
      title,
      status: "DRAFT",
      scheduledAt: scheduledRaw ? new Date(scheduledRaw) : null,
      createdById: user.id,
      previewToken: newPreviewToken(),
      items: {
        create: orderedIds.map((partnerId, sortOrder) => ({ partnerId, sortOrder })),
      },
    },
  });

  return { ok: true, id: meeting.id };
}

export async function startPartnerReviewMeetingAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };

  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      status: "LIVE",
      startedAt: meeting.startedAt ?? new Date(),
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true };
}

export async function endPartnerReviewMeetingAction(meetingId: string) {
  await requireUser();
  try {
    await db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: {
        status: "PROCESSING",
        endedAt: new Date(),
      },
    });
    revalidateMeeting(meetingId);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 结束会议后回到会前：清空打标、纪要、拆分草案，保留议程与会前简报 */
export async function resetMeetingToPrepAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting) return { error: "会议不存在" };
  if (meeting.status === "DONE") return { error: "已完成的历史会议不可重置" };
  if (meeting.status !== "PROCESSING" && meeting.status !== "LIVE") {
    return { error: "仅进行中或会后处理阶段可回到会前" };
  }

  await db.$transaction([
    db.partnerReviewTodoDraft.deleteMany({ where: { item: { meetingId } } }),
    db.partnerReviewItem.updateMany({
      where: { meetingId },
      data: {
        discussedAt: null,
        markerInsertedAt: null,
        status: "PENDING",
        coreNotes: null,
        confirmedSnapshot: null,
      },
    }),
    db.partnerReviewMeeting.update({
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

export async function saveLiveNotesAction(meetingId: string, liveNotes: string) {
  await requireUser();
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  revalidateMeeting(meetingId);
  return { ok: true };
}

export async function discussPartnerAction(meetingId: string, itemId: string) {
  await requireUser();
  const res = await markPartnerDiscussed(meetingId, itemId);
  if ("error" in res) return { error: res.error };
  revalidateMeeting(meetingId);
  return {
    ok: true,
    partnerName: res.partnerName,
    discussedAt: res.discussedAt,
    relativeMs: res.relativeMs,
  };
}

export async function runMeetingPrepAction(meetingId: string) {
  const user = await requireUser();
  try {
    await generateMeetingPrepBriefs(meetingId, user.id);
    await ensureMeetingPreviewToken(meetingId);
    revalidateMeeting(meetingId);
    return { ok: true, message: "开会准备已完成" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getMeetingPreviewPathAction(meetingId: string) {
  await requireUser();
  const token = await ensureMeetingPreviewToken(meetingId);
  return { ok: true as const, path: `/partner-reviews/preview/${token}` };
}

/** 会中 / 会后处理阶段追加议程伙伴（复用创建会议选人 + 简报逻辑） */
export async function addPartnersToMeetingAction(meetingId: string, partnerIds: string[]) {
  const user = await requireUser();
  const ids = [...new Set(partnerIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { error: "请至少选择一个伙伴" };

  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    select: {
      status: true,
      prepGeneratedAt: true,
      items: { orderBy: { sortOrder: "asc" }, select: { partnerId: true, sortOrder: true } },
    },
  });
  if (!meeting) return { error: "会议不存在" };
  if (!["PREP", "LIVE", "PROCESSING"].includes(meeting.status)) {
    return { error: "当前状态无法追加伙伴" };
  }

  const existing = new Set(meeting.items.map((it) => it.partnerId));
  const newIds = ids.filter((id) => !existing.has(id));
  if (!newIds.length) return { error: "所选伙伴已在议程中" };

  const partners = await db.partner.findMany({
    where: { id: { in: newIds }, status: "ACTIVE" },
    select: { id: true, name: true, tier: true },
  });
  if (!partners.length) return { error: "未找到有效的正式伙伴" };

  const orderedIds = newIds.filter((id) => partners.some((p) => p.id === id));
  const maxSort = meeting.items.reduce((m, it) => Math.max(m, it.sortOrder), -1);

  const createdItems: ReviewItemClient[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const partnerId = orderedIds[i]!;
    const brief = await buildPartnerPrepBrief(partnerId, { userId: user.id });
    const row = await db.partnerReviewItem.create({
      data: {
        meetingId,
        partnerId,
        sortOrder: maxSort + 1 + i,
        prepBrief: brief ? JSON.stringify(brief) : null,
      },
      include: {
        partner: { select: { id: true, name: true, tier: true } },
        todoDrafts: { orderBy: { sortOrder: "asc" } },
      },
    });
    createdItems.push(toReviewItemClient(row));
  }

  if (!meeting.prepGeneratedAt && createdItems.some((it) => it.prepBrief)) {
    await db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: { prepGeneratedAt: new Date() },
    });
  }

  revalidateMeeting(meetingId);
  return { ok: true as const, items: createdItems };
}

export async function runMeetingSplitAction(meetingId: string) {
  const user = await requireUser();
  try {
    const proposal = await buildSplitProposal(meetingId, user.id);
    await persistSplitDrafts(proposal);
    revalidateMeeting(meetingId);
    return { ok: true, proposal };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function confirmMeetingItemsAction(meetingId: string, items: ConfirmItemPayload[]) {
  const user = await requireUser();
  try {
    const results = await applyPartnerReviewConfirm({ meetingId, userId: user.id, items });
    revalidateMeeting(meetingId);
    revalidatePath("/partners");
    revalidatePath("/");
    return { ok: true, results };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function attachDingTalkRecordingAction(
  meetingId: string,
  data: { recordId?: string; conferenceId?: string; spaceId?: string; fileId?: string },
) {
  await requireUser();
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      dingtalkRecordId: data.recordId || null,
      dingtalkConferenceId: data.conferenceId || null,
      dingtalkSpaceId: data.spaceId || null,
      dingtalkFileId: data.fileId || null,
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true };
}

export async function previewMeetingMatchAction(meetingId: string) {
  const user = await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { partner: { select: { id: true, name: true } } },
      },
    },
  });
  if (!meeting) return { error: "会议不存在" };

  const { segments, method } = await matchMinutesToPartners(meeting, user.id);
  return {
    ok: true as const,
    segments: segments.map((s) => ({
      partnerId: s.partnerId,
      partnerName: s.partnerName,
      text: s.text,
    })),
    matchMethod: method,
    liveNotes: meeting.liveNotes,
  };
}

export async function saveMatchedNotesAction(meetingId: string, liveNotes: string) {
  await requireUser();
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  revalidateMeeting(meetingId);
  return { ok: true as const };
}

export async function pullDingTalkTranscriptAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };

  try {
    let text: string | null = null;
    let transcriptJson: string | null = null;
    const recordingAnchor = meeting.startedAt ?? meeting.recordingStartedAt;

    if (meeting.dingtalkConferenceId) {
      const timed = await fetchConferenceTranscript({
        conferenceId: meeting.dingtalkConferenceId,
        recordingStartedAt: recordingAnchor,
      });
      if (timed) {
        text = timed.plain;
        transcriptJson = serializeTimedTranscriptDoc(timed);
      }
    }

    if (!text && meeting.dingtalkFileId) {
      const file = await downloadDingDriveTranscript({
        spaceId: meeting.dingtalkSpaceId ?? undefined,
        fileId: meeting.dingtalkFileId,
        recordingStartedAt: recordingAnchor,
      });
      text = file?.text ?? null;
      if (file?.timed) transcriptJson = serializeTimedTranscriptDoc(file.timed);
    }

    if (!text?.trim()) {
      return { error: "未能拉取到转写文本。请确认已绑定录音/会议 ID，或手动粘贴转写。" };
    }

    if (!transcriptJson) {
      const parsed = parseTranscriptTextToTimedDoc(text, { recordingStartedAt: recordingAnchor });
      if (parsed) transcriptJson = serializeTimedTranscriptDoc(parsed);
    }

    await db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: {
        transcriptText: text,
        transcriptJson,
        status: "PROCESSING",
        endedAt: meeting.endedAt ?? new Date(),
      },
    });
    await materializeLiveNotesForMeeting(meetingId);
    revalidateMeeting(meetingId);
    const timedHint = transcriptJson ? "，已保留句子时间轴" : "";
    return { ok: true, message: `已拉取转写（${text.length} 字${timedHint}），记录本已自动生成` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveTranscriptTextAction(meetingId: string, transcriptText: string) {
  const user = await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { startedAt: true, recordingStartedAt: true },
  });
  const anchor = meeting?.startedAt ?? meeting?.recordingStartedAt ?? null;
  const timed = parseTranscriptTextToTimedDoc(transcriptText, {
    recordingStartedAt: anchor,
  });
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText,
      transcriptJson: timed ? serializeTimedTranscriptDoc(timed) : null,
      transcriptStatus: transcriptText.trim() ? "ready" : "idle",
      status: "PROCESSING",
    },
  });
  const { liveNotes, matchMethod } = await materializeLiveNotesForMeeting(meetingId, user.id);
  revalidateMeeting(meetingId);
  return { ok: true as const, liveNotes, matchMethod };
}

export async function deletePartnerReviewMeetingAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true },
  });
  if (!meeting) return { error: "会议不存在" };
  if (meeting.status === "DONE") {
    return { error: "已完成的历史会议不可删除，请从历史中回看" };
  }
  await db.partnerReviewMeeting.delete({ where: { id: meetingId } });
  revalidatePath("/partner-reviews");
  revalidatePath("/ops");
  return { ok: true };
}
