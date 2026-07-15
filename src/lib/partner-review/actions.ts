"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { db } from "../db";
import { generateMeetingPrepBriefs } from "./brief";
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

  revalidateMeeting(meeting.id);
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
