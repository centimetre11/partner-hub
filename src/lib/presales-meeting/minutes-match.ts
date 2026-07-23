import "server-only";

import { parseNumberedSummarySections } from "../partner-review/minutes-match";
import {
  parseTimedTranscriptDoc,
  parseTranscriptTextToTimedDoc,
} from "../partner-review/transcript";
import {
  assignSentencesByRelativeMarkerTime,
  type TranscriptSegment,
} from "./markers";
import { itemDisplayLabel } from "./types";

export type MatchAgendaItem = {
  id: string;
  label: string;
  markerInsertedAt: Date | null;
  discussedAt: Date | null;
  sortOrder: number;
};

export type MatchMeeting = {
  transcriptText: string | null;
  transcriptJson: string | null;
  startedAt: Date | null;
  recordingStartedAt: Date | null;
  endedAt: Date | null;
  items: MatchAgendaItem[];
};

function markedOrder(items: MatchAgendaItem[]) {
  return [...items]
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = (a.markerInsertedAt ?? a.discussedAt)!.getTime();
      const tb = (b.markerInsertedAt ?? b.discussedAt)!.getTime();
      return ta - tb;
    });
}

function matchBySummarySections(
  text: string,
  items: MatchAgendaItem[],
): TranscriptSegment[] | null {
  const sections = parseNumberedSummarySections(text);
  const marked = markedOrder(items);
  if (!sections.length || !marked.length) return null;

  const segments: TranscriptSegment[] = [];
  const beforeSummary = text.split(/小结/)[0]?.trim();
  if (beforeSummary && !/^会议概览\s*$/.test(beforeSummary.slice(0, 40))) {
    segments.push({ partnerId: null, partnerName: null, text: beforeSummary });
  }

  const n = Math.min(sections.length, marked.length);
  for (let i = 0; i < n; i++) {
    const it = marked[i]!;
    const sec = sections[i]!;
    segments.push({
      partnerId: it.id,
      partnerName: it.label,
      text: `${sec.title}\n${sec.body}`.trim(),
    });
  }
  if (sections.length > marked.length) {
    const rest = sections
      .slice(marked.length)
      .map((s) => `${s.title}\n${s.body}`.trim())
      .join("\n\n");
    if (rest) segments.push({ partnerId: null, partnerName: null, text: rest });
  }
  return segments;
}

function matchSequential(text: string, items: MatchAgendaItem[]): TranscriptSegment[] {
  const marked = markedOrder(items);
  const order = marked.length ? marked : [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!order.length) {
    return [{ partnerId: null, partnerName: null, text: text.trim() }];
  }
  if (order.length === 1) {
    return [{ partnerId: order[0]!.id, partnerName: order[0]!.label, text: text.trim() }];
  }

  const chunks = text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length >= order.length) {
    const per = Math.floor(chunks.length / order.length);
    const segments: TranscriptSegment[] = [];
    let offset = 0;
    for (let i = 0; i < order.length; i++) {
      const take = i === order.length - 1 ? chunks.length - offset : per;
      const body = chunks.slice(offset, offset + take).join("\n\n");
      offset += take;
      segments.push({
        partnerId: order[i]!.id,
        partnerName: order[i]!.label,
        text: body,
      });
    }
    return segments;
  }

  return order.map((it, i) => ({
    partnerId: it.id,
    partnerName: it.label,
    text: i === 0 ? text.trim() : "",
  }));
}

function matchByTimeline(meeting: MatchMeeting): TranscriptSegment[] | null {
  const anchor = meeting.recordingStartedAt ?? meeting.startedAt;
  if (!anchor) return null;
  const marked = markedOrder(meeting.items);
  if (!marked.length) return null;

  const doc =
    (meeting.transcriptJson ? parseTimedTranscriptDoc(meeting.transcriptJson) : null) ??
    (meeting.transcriptText
      ? parseTranscriptTextToTimedDoc(meeting.transcriptText, { recordingStartedAt: anchor })
      : null);
  if (!doc?.sentences?.length) return null;

  const boundaries = marked.map((it) => ({
    partnerId: it.id,
    partnerName: it.label,
    atMs: Math.max(
      0,
      (it.markerInsertedAt ?? it.discussedAt)!.getTime() - anchor.getTime(),
    ),
  }));

  const sentences = doc.sentences.map((s) => ({
    atMs:
      doc.timeBase === "relative_ms"
        ? s.startTime
        : doc.timeBase === "absolute_ms" && meeting.recordingStartedAt
          ? s.startTime - meeting.recordingStartedAt.getTime()
          : s.startTime,
    line: s.text ?? "",
  }));

  return assignSentencesByRelativeMarkerTime(sentences, boundaries);
}

export async function matchMinutesToItems(
  meeting: MatchMeeting,
): Promise<{ segments: TranscriptSegment[]; method: string }> {
  const text = meeting.transcriptText?.trim() ?? "";
  if (!text && !meeting.transcriptJson) {
    return { segments: [], method: "empty" };
  }

  const timeline = matchByTimeline(meeting);
  if (timeline?.some((s) => s.text.trim())) {
    return { segments: timeline, method: "timeline" };
  }

  if (text) {
    const bySection = matchBySummarySections(text, meeting.items);
    if (bySection?.some((s) => s.partnerId && s.text.trim())) {
      return { segments: bySection, method: "summary_sections" };
    }
    return { segments: matchSequential(text, meeting.items), method: "sequential" };
  }

  return { segments: [], method: "empty" };
}

export function toMatchAgendaItem(it: {
  id: string;
  markerInsertedAt: Date | null;
  discussedAt: Date | null;
  sortOrder: number;
  subjectKind?: string | null;
  user: { name: string };
  customer: { name: string } | null;
  project: { name: string } | null;
  opportunity?: { name: string } | null;
  partner?: { name: string } | null;
}): MatchAgendaItem {
  return {
    id: it.id,
    label: itemDisplayLabel({
      userName: it.user.name,
      subjectKind: it.subjectKind,
      customerName: it.customer?.name ?? null,
      projectName: it.project?.name ?? null,
      opportunityName: it.opportunity?.name ?? null,
      partnerName: it.partner?.name ?? null,
    }),
    markerInsertedAt: it.markerInsertedAt,
    discussedAt: it.discussedAt,
    sortOrder: it.sortOrder,
  };
}
