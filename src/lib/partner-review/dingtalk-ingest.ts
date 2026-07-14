import "server-only";

import { db } from "../db";
import {
  extractRecordingRefs,
  isRecordingCompleteEvent,
  type DingTalkEventPayload,
} from "../dingtalk/events";
import { downloadDingDriveTranscript, fetchConferenceTranscript } from "../dingtalk/drive";
import {
  parseTranscriptTextToTimedDoc,
  serializeTimedTranscriptDoc,
  type TimedTranscriptDoc,
} from "./transcript";

/** 将钉钉录音完成事件关联到进行中的过伙伴会议并写入转写 */
export async function handleDingTalkRecordingEvent(event: DingTalkEventPayload) {
  if (!isRecordingCompleteEvent(event)) {
    return { ok: true, skipped: true as const, reason: "not_recording_event" };
  }

  const refs = extractRecordingRefs(event);

  // 优先：JSAPI startDingerRecord 的 businessOrder（会议 ID）
  let meeting =
    (refs.businessOrder
      ? await db.partnerReviewMeeting.findUnique({ where: { id: refs.businessOrder } })
      : null) ??
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

  let transcriptText: string | null = meeting.transcriptText;
  let timed: TimedTranscriptDoc | null = null;
  try {
    if (refs.conferenceId) {
      timed = await fetchConferenceTranscript({
        conferenceId: refs.conferenceId,
        recordingStartedAt: meeting.startedAt,
      });
      if (timed) transcriptText = timed.plain;
    }
    if (!transcriptText && refs.fileId) {
      const file = await downloadDingDriveTranscript({
        spaceId: refs.spaceId,
        fileId: refs.fileId,
        recordingStartedAt: meeting.startedAt,
      });
      if (file) {
        transcriptText = file.text;
        timed = file.timed ?? timed;
      }
    }
  } catch (e) {
    console.warn("[dingtalk] transcript pull failed", e);
  }

  // 若事件自带 payload 文本 / Markdown 摘要
  const payload = event.payload as { result?: string; text?: string; content?: string; markdown?: string } | undefined;
  const data = event.data as { text?: string; content?: string; markdown?: string; summary?: string } | undefined;
  if (!transcriptText && payload?.markdown) transcriptText = String(payload.markdown);
  if (!transcriptText && payload?.content) transcriptText = String(payload.content);
  if (!transcriptText && payload?.result) transcriptText = String(payload.result);
  if (!transcriptText && payload?.text) transcriptText = String(payload.text);
  if (!transcriptText && data?.markdown) transcriptText = String(data.markdown);
  if (!transcriptText && data?.content) transcriptText = String(data.content);
  if (!transcriptText && data?.summary) transcriptText = String(data.summary);
  if (!transcriptText && data?.text) transcriptText = String(data.text);
  if (!transcriptText && typeof event.text === "string") transcriptText = event.text;

  if (!timed && transcriptText) {
    timed = parseTranscriptTextToTimedDoc(transcriptText, { recordingStartedAt: meeting.startedAt });
  }

  await db.partnerReviewMeeting.update({
    where: { id: meeting.id },
    data: {
      dingtalkRecordId: refs.recordId ?? meeting.dingtalkRecordId,
      dingtalkConferenceId: refs.conferenceId ?? meeting.dingtalkConferenceId,
      dingtalkSpaceId: refs.spaceId ?? meeting.dingtalkSpaceId,
      dingtalkFileId: refs.fileId ?? meeting.dingtalkFileId,
      transcriptText: transcriptText ?? meeting.transcriptText,
      transcriptJson: timed ? serializeTimedTranscriptDoc(timed) : meeting.transcriptJson,
      status: "PROCESSING",
      endedAt: meeting.endedAt ?? new Date(),
    },
  });

  return {
    ok: true as const,
    meetingId: meeting.id,
    hasTranscript: !!transcriptText,
  };
}
