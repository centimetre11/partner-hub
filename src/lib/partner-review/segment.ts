import "server-only";

import type { PartnerReviewMeeting, PartnerReviewItem, Partner } from "@prisma/client";
import {
  assignSentencesByRelativeMarkerTime,
  splitTranscriptByMarkers,
  type TranscriptSegment,
} from "./markers";
import {
  parseTimedTranscriptDoc,
  parseTranscriptTextToTimedDoc,
  type TimedTranscriptDoc,
  type TranscriptSentence,
} from "./transcript";

type MeetingWithItems = PartnerReviewMeeting & {
  items: (PartnerReviewItem & { partner: Pick<Partner, "id" | "name"> })[];
};

function sentenceRelativeMs(
  sentence: TranscriptSentence,
  doc: TimedTranscriptDoc,
  recordingStartedAt: Date | null,
): number | null {
  const t = sentence.startTime;
  if (!Number.isFinite(t)) return null;
  if (doc.timeBase === "relative_ms" || t < 1e12) {
    return t > 0 && t < 1e7 ? Math.round(t * 1000) : Math.round(t);
  }
  if (recordingStartedAt) {
    return t - recordingStartedAt.getTime();
  }
  return null;
}

/** 根据腾讯会议纪要 + 议程打点（相对开会时间）拆成伙伴段落 */
export function computeTranscriptSegments(meeting: MeetingWithItems): TranscriptSegment[] {
  const anchor = meeting.startedAt ?? meeting.recordingStartedAt;
  const timed =
    parseTimedTranscriptDoc(meeting.transcriptJson) ??
    parseTranscriptTextToTimedDoc(meeting.transcriptText ?? "", {
      recordingStartedAt: anchor,
    });

  if (!timed?.sentences.length) {
    if (!meeting.transcriptText?.trim()) return [];
    const hasMarkers = /<<<PARTNER:[^|>]+|[^>]+>>>/.test(meeting.transcriptText);
    return hasMarkers
      ? splitTranscriptByMarkers(meeting.transcriptText)
      : [{ partnerId: null, partnerName: null, text: meeting.transcriptText.trim() }];
  }

  const boundaries = meeting.items
    .map((it) => {
      const at = it.markerInsertedAt ?? it.discussedAt;
      if (!at || !anchor) return null;
      return {
        partnerId: it.partnerId,
        partnerName: it.partner.name,
        atMs: at.getTime() - anchor.getTime(),
      };
    })
    .filter((b): b is { partnerId: string; partnerName: string; atMs: number } => !!b && b.atMs >= 0)
    .sort((a, b) => a.atMs - b.atMs);

  if (!boundaries.length) {
    return [
      {
        partnerId: null,
        partnerName: null,
        text: timed.plain || timed.sentences.map((s) => s.text).join("\n"),
      },
    ];
  }

  const sentences = timed.sentences.map((s) => ({
    atMs: sentenceRelativeMs(s, timed, anchor),
    line: s.speaker ? `${s.speaker}: ${s.text}` : s.text,
  }));

  const segments = assignSentencesByRelativeMarkerTime(sentences, boundaries);

  for (const b of boundaries) {
    if (!segments.some((s) => s.partnerId === b.partnerId)) {
      segments.push({ partnerId: b.partnerId, partnerName: b.partnerName, text: "" });
    }
  }

  const order = new Map(boundaries.map((b, i) => [b.partnerId, i]));
  segments.sort((a, b) => {
    if (a.partnerId == null) return -1;
    if (b.partnerId == null) return 1;
    return (order.get(a.partnerId) ?? 99) - (order.get(b.partnerId) ?? 99);
  });

  return segments;
}
