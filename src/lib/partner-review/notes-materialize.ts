import "server-only";

import type { TranscriptSegment } from "./markers";
import { computeTranscriptSegments } from "./segment";
import { db } from "../db";

/** 将拆分后的伙伴段落渲染为可读的会议记录（无 <<<PARTNER>>> 标记） */
export function buildLiveNotesFromSegments(segments: TranscriptSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    const body = seg.text.trim();
    if (seg.partnerName) {
      parts.push(body ? `## ${seg.partnerName}\n${body}` : `## ${seg.partnerName}\n（该时段未识别到有效语音）`);
    } else if (body) {
      parts.push(`## 未归属\n${body}`);
    }
  }
  return parts.join("\n\n");
}

/** 转写到位后，按议程打点 + 句子时间轴自动生成记录本 */
export async function materializeLiveNotesForMeeting(meetingId: string): Promise<string | null> {
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { partner: { select: { id: true, name: true } } },
      },
    },
  });
  if (!meeting) return null;
  if (!meeting.transcriptText?.trim() && !meeting.transcriptJson) return null;

  const segments = computeTranscriptSegments(meeting);
  if (!segments.some((s) => s.text.trim())) return null;

  const liveNotes = buildLiveNotesFromSegments(segments);
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  return liveNotes;
}
