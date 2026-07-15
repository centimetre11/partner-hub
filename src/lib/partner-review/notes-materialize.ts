import "server-only";

import { buildLiveNotesFromSegments } from "./markers";
import { computeTranscriptSegments } from "./segment";
import { db } from "../db";

export { buildLiveNotesFromSegments, parsePartnerSectionsFromLiveNotes } from "./markers";

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
