import "server-only";

import { db } from "../db";
import {
  buildTimedTranscriptDoc,
  parseTimedTranscriptDoc,
  serializeTimedTranscriptDoc,
  type TranscriptSentence,
} from "../partner-review/transcript";

/** 追加一条讯飞终句到会议转写时间轴 */
export async function appendFinalTranscriptSentence(
  meetingId: string,
  opts: { text: string; startMs?: number; endMs?: number },
): Promise<{ plain: string; duplicate: boolean; sentence: string }> {
  const text = opts.text.trim();
  if (!text) {
    const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
    return { plain: meeting?.transcriptText ?? "", duplicate: true, sentence: "" };
  }

  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new Error("会议不存在");

  const startMs = Math.max(0, Number(opts.startMs) || 0);
  const endMs = opts.endMs != null ? Math.max(startMs, Number(opts.endMs)) : undefined;

  const prev = parseTimedTranscriptDoc(meeting.transcriptJson);
  const prevSentences = prev?.sentences ?? [];

  const dup = prevSentences.some(
    (s) => s.text === text && Math.abs((s.startTime || 0) - startMs) < 500,
  );
  if (dup) {
    return { plain: meeting.transcriptText ?? "", duplicate: true, sentence: text };
  }

  const newSentence: TranscriptSentence = { startTime: startMs, endTime: endMs, text };
  const merged = buildTimedTranscriptDoc({
    sentences: [...prevSentences, newSentence],
    timeBase: "relative_ms",
    recordingStartedAt: meeting.recordingStartedAt ?? meeting.startedAt,
  });

  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText: merged.plain,
      transcriptJson: serializeTimedTranscriptDoc(merged),
      transcriptStatus: "recording",
      transcriptError: null,
      status: meeting.status === "DRAFT" || meeting.status === "PREP" ? "LIVE" : meeting.status,
    },
  });

  return { plain: merged.plain, duplicate: false, sentence: text };
}
