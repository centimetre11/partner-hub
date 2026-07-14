"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../session";
import { db } from "../db";
import { formatPartnerMarker, appendMarkerToNotes } from "./markers";
import { generateMeetingPrepBriefs } from "./brief";
import { buildSplitProposal, persistSplitDrafts } from "./split";
import { applyPartnerReviewConfirm, type ConfirmItemPayload } from "./apply";
import { downloadDingDriveText, fetchConferenceTranscriptText } from "../dingtalk/drive";

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
  const liveNotes = appendMarkerToNotes(item.meeting.liveNotes, marker);
  const now = new Date();

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
  return { ok: true, marker, liveNotes };
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

export async function pullDingTalkTranscriptAction(meetingId: string) {
  await requireUser();
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return { error: "会议不存在" };

  try {
    let text: string | null = null;

    if (meeting.dingtalkConferenceId) {
      text = await fetchConferenceTranscriptText({ conferenceId: meeting.dingtalkConferenceId });
    }

    if (!text && meeting.dingtalkFileId) {
      const file = await downloadDingDriveText({
        spaceId: meeting.dingtalkSpaceId ?? undefined,
        fileId: meeting.dingtalkFileId,
      });
      text = file?.text ?? null;
    }

    if (!text?.trim()) {
      return { error: "未能拉取到转写文本。请确认已绑定录音/会议 ID，或手动粘贴转写。" };
    }

    await db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: {
        transcriptText: text,
        status: "PROCESSING",
        endedAt: meeting.endedAt ?? new Date(),
      },
    });
    revalidateMeeting(meetingId);
    return { ok: true, message: `已拉取转写（${text.length} 字）` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveTranscriptTextAction(meetingId: string, transcriptText: string) {
  await requireUser();
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText,
      status: "PROCESSING",
    },
  });
  revalidateMeeting(meetingId);
  return { ok: true };
}

export async function deletePartnerReviewMeetingAction(meetingId: string) {
  await requireUser();
  await db.partnerReviewMeeting.delete({ where: { id: meetingId } });
  revalidatePath("/partner-reviews");
  return { ok: true };
}
