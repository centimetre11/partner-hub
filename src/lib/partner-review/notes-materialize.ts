import "server-only";

import { buildLiveNotesFromSegments } from "./markers";
import { matchMinutesToPartners } from "./minutes-match";
import { db } from "../db";

export { buildLiveNotesFromSegments, parsePartnerSectionsFromLiveNotes } from "./markers";

/** 粘贴腾讯纪要后，按时间轴 / AI 语义匹配到各伙伴并生成记录本 */
export async function materializeLiveNotesForMeeting(
  meetingId: string,
  userId?: string,
): Promise<{ liveNotes: string | null; matchMethod?: string }> {
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { partner: { select: { id: true, name: true } } },
      },
    },
  });
  if (!meeting) return { liveNotes: null };
  if (!meeting.transcriptText?.trim() && !meeting.transcriptJson) return { liveNotes: null };

  const { segments, method } = await matchMinutesToPartners(meeting, userId);
  if (!segments.some((s) => s.text.trim())) return { liveNotes: null, matchMethod: method };

  const liveNotes = buildLiveNotesFromSegments(segments);
  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  return { liveNotes, matchMethod: method };
}
