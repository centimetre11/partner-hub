import "server-only";

import { db } from "../db";
import { buildLiveNotesFromSegments } from "./markers";
import { matchMinutesToItems, toMatchAgendaItem } from "./minutes-match";

export async function materializeLiveNotesForMeeting(
  meetingId: string,
): Promise<{ liveNotes: string | null; matchMethod?: string }> {
  const meeting = await db.presalesProjectMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          user: { select: { name: true } },
          customer: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  if (!meeting) return { liveNotes: null };
  if (!meeting.transcriptText?.trim() && !meeting.transcriptJson) return { liveNotes: null };

  const { segments, method } = await matchMinutesToItems({
    transcriptText: meeting.transcriptText,
    transcriptJson: meeting.transcriptJson,
    startedAt: meeting.startedAt,
    recordingStartedAt: meeting.recordingStartedAt,
    endedAt: meeting.endedAt,
    items: meeting.items.map(toMatchAgendaItem),
  });
  if (!segments.some((s) => s.text.trim())) return { liveNotes: null, matchMethod: method };

  const liveNotes = buildLiveNotesFromSegments(segments);
  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  return { liveNotes, matchMethod: method };
}
