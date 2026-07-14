import "server-only";

import { db } from "../db";
import {
  extractRecordingRefs,
  isRecordingCompleteEvent,
  type DingTalkEventPayload,
} from "../dingtalk/events";
import { downloadDingDriveText, fetchConferenceTranscriptText } from "../dingtalk/drive";

/** 将钉钉录音完成事件关联到进行中的过伙伴会议并写入转写 */
export async function handleDingTalkRecordingEvent(event: DingTalkEventPayload) {
  if (!isRecordingCompleteEvent(event)) {
    return { ok: true, skipped: true as const, reason: "not_recording_event" };
  }

  const refs = extractRecordingRefs(event);

  // 优先按 recordId / conferenceId 精确匹配
  let meeting =
    (refs.recordId
      ? await db.partnerReviewMeeting.findFirst({
          where: { dingtalkRecordId: refs.recordId },
          orderBy: { updatedAt: "desc" },
        })
      : null) ??
    (refs.conferenceId
      ? await db.partnerReviewMeeting.findFirst({
          where: { dingtalkConferenceId: refs.conferenceId },
          orderBy: { updatedAt: "desc" },
        })
      : null);

  // 回退：最近一场 LIVE / PROCESSING 会议（2 天内）
  if (!meeting) {
    const since = new Date();
    since.setDate(since.getDate() - 2);
    meeting = await db.partnerReviewMeeting.findFirst({
      where: {
        status: { in: ["LIVE", "PROCESSING", "PREP"] },
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!meeting) {
    return { ok: true, skipped: true as const, reason: "no_meeting_matched" };
  }

  let transcript: string | null = meeting.transcriptText;
  try {
    if (refs.conferenceId) {
      transcript = (await fetchConferenceTranscriptText({ conferenceId: refs.conferenceId })) ?? transcript;
    }
    if (!transcript && refs.fileId) {
      const file = await downloadDingDriveText({ spaceId: refs.spaceId, fileId: refs.fileId });
      transcript = file?.text ?? transcript;
    }
  } catch (e) {
    console.warn("[dingtalk] transcript pull failed", e);
  }

  // 若事件自带 payload 文本 / Markdown 摘要
  const payload = event.payload as { result?: string; text?: string; content?: string; markdown?: string } | undefined;
  const data = event.data as { text?: string; content?: string; markdown?: string; summary?: string } | undefined;
  if (!transcript && payload?.markdown) transcript = String(payload.markdown);
  if (!transcript && payload?.content) transcript = String(payload.content);
  if (!transcript && payload?.result) transcript = String(payload.result);
  if (!transcript && payload?.text) transcript = String(payload.text);
  if (!transcript && data?.markdown) transcript = String(data.markdown);
  if (!transcript && data?.content) transcript = String(data.content);
  if (!transcript && data?.summary) transcript = String(data.summary);
  if (!transcript && data?.text) transcript = String(data.text);
  if (!transcript && typeof event.text === "string") transcript = event.text;

  await db.partnerReviewMeeting.update({
    where: { id: meeting.id },
    data: {
      dingtalkRecordId: refs.recordId ?? meeting.dingtalkRecordId,
      dingtalkConferenceId: refs.conferenceId ?? meeting.dingtalkConferenceId,
      dingtalkSpaceId: refs.spaceId ?? meeting.dingtalkSpaceId,
      dingtalkFileId: refs.fileId ?? meeting.dingtalkFileId,
      transcriptText: transcript ?? meeting.transcriptText,
      status: "PROCESSING",
      endedAt: meeting.endedAt ?? new Date(),
    },
  });

  return {
    ok: true as const,
    meetingId: meeting.id,
    hasTranscript: !!transcript,
  };
}
