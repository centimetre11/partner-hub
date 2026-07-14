"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { db } from "../db";
import { formatPartnerMarker, appendMarkerToNotes } from "./markers";
import { generateMeetingPrepBriefs } from "./brief";
import { buildSplitProposal, persistSplitDrafts } from "./split";
import { applyPartnerReviewConfirm, type ConfirmItemPayload } from "./apply";
import { downloadDingDriveTranscript, fetchConferenceTranscript } from "../dingtalk/drive";
import {
  parseTranscriptTextToTimedDoc,
  serializeTimedTranscriptDoc,
} from "./transcript";
import { runMeetingAsrPipeline } from "../asr/pipeline";
import { getAsrConfig } from "../asr/config";

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
  const item = await db.partnerReviewItem.findFirst({
    where: { id: itemId, meetingId },
    include: { partner: { select: { id: true, name: true } }, meeting: true },
  });
  if (!item) return { error: "议程项不存在" };

  const marker = formatPartnerMarker(item.partner.id, item.partner.name);
  const now = new Date();
  const liveNotes = appendMarkerToNotes(item.meeting.liveNotes, marker, {
    partnerName: item.partner.name,
    at: now,
  });

  await db.$transaction([
    db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: {
        liveNotes,
        status: item.meeting.status === "LIVE" ? "LIVE" : item.meeting.status === "DRAFT" || item.meeting.status === "PREP" ? "LIVE" : item.meeting.status,
        startedAt: item.meeting.startedAt ?? now,
      },
    }),
    db.partnerReviewItem.update({
      where: { id: itemId },
      data: {
        status: item.status === "CONFIRMED" ? "CONFIRMED" : "DISCUSSED",
        discussedAt: item.discussedAt ?? now,
        markerInsertedAt: item.markerInsertedAt ?? now,
      },
    }),
  ]);

  revalidateMeeting(meetingId);
  return { ok: true, marker, liveNotes, partnerName: item.partner.name, discussedAt: now.toISOString() };
}

export async function runMeetingPrepAction(meetingId: string) {
  const user = await requireUser();
  try {
    await generateMeetingPrepBriefs(meetingId, user.id);
    revalidateMeeting(meetingId);
    return { ok: true, message: "开会准备已完成" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
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

/** 浏览器自研录音开始（对齐录音起点与拆分时间轴） */
export async function markLocalRecordingStartedAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };
  const now = new Date();
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      recordingStartedAt: meeting.recordingStartedAt ?? now,
      transcriptStatus: "recording",
      transcriptError: null,
      status: meeting.status === "DRAFT" || meeting.status === "PREP" ? "LIVE" : meeting.status,
      startedAt: meeting.startedAt ?? now,
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true, startedAt: (meeting.recordingStartedAt ?? now).toISOString() };
}

/** 对已上传的本地录音跑 Whisper ASR + 伙伴名纠偏 */
export async function runLocalAsrAction(meetingId: string) {
  const user = await requireUser();
  if (!getAsrConfig().enabled) {
    return {
      error:
        "未配置 ASR_BASE_URL。请在 docker-compose 启动 whisper-asr（faster-whisper），并设置 ASR_BASE_URL=http://whisper-asr:9000",
    };
  }
  try {
    const result = await runMeetingAsrPipeline(meetingId, user.id);
    revalidateMeeting(meetingId);
    return {
      ok: true,
      message: `转写完成（${result.chars} 字 / ${result.sentences} 段），可用 AI 拆分`,
    };
  } catch (e) {
    revalidateMeeting(meetingId);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** JSAPI 启动 A1 录音成功后回写 fid，便于回调关联 */
export async function markDingTalkRecordingStartedAction(
  meetingId: string,
  data: { fid?: number | string | null } = {},
) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };
  const fid = data.fid != null && String(data.fid).trim() ? String(data.fid).trim() : null;
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      ...(fid ? { dingtalkFileId: fid } : {}),
      status: meeting.status === "DRAFT" || meeting.status === "PREP" ? "LIVE" : meeting.status,
      startedAt: meeting.startedAt ?? new Date(),
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true };
}

export async function pullDingTalkTranscriptAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };

  try {
    let text: string | null = null;
    let transcriptJson: string | null = null;

    if (meeting.dingtalkConferenceId) {
      const timed = await fetchConferenceTranscript({
        conferenceId: meeting.dingtalkConferenceId,
        recordingStartedAt: meeting.startedAt,
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
        recordingStartedAt: meeting.startedAt,
      });
      text = file?.text ?? null;
      if (file?.timed) transcriptJson = serializeTimedTranscriptDoc(file.timed);
    }

    if (!text?.trim()) {
      return { error: "未能拉取到转写文本。请确认已绑定录音/会议 ID，或手动粘贴转写。" };
    }

    if (!transcriptJson) {
      const parsed = parseTranscriptTextToTimedDoc(text, { recordingStartedAt: meeting.startedAt });
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
    revalidateMeeting(meetingId);
    const timedHint = transcriptJson ? "，已保留句子时间轴" : "";
    return { ok: true, message: `已拉取转写（${text.length} 字${timedHint}）` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveTranscriptTextAction(meetingId: string, transcriptText: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { startedAt: true },
  });
  const timed = parseTranscriptTextToTimedDoc(transcriptText, {
    recordingStartedAt: meeting?.startedAt ?? null,
  });
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText,
      transcriptJson: timed ? serializeTimedTranscriptDoc(timed) : null,
      status: "PROCESSING",
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true };
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
