import "server-only";

import { db } from "../db";
import type { TimedTranscriptDoc } from "../partner-review/transcript";

/** 按会中打点时间，把讯飞转写切成各线索段落 */
export async function materializeLeadReviewLiveNotes(
  meetingId: string,
  doc: TimedTranscriptDoc,
): Promise<string | null> {
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          displayName: true,
          markerInsertedAt: true,
          discussedAt: true,
          status: true,
        },
      },
    },
  });
  if (!meeting) return null;

  const anchor = meeting.recordingStartedAt ?? meeting.startedAt;
  const discussed = meeting.items
    .filter((it) => it.markerInsertedAt || it.discussedAt || it.status === "DISCUSSED" || it.status === "CONFIRMED")
    .map((it) => {
      const markAt = it.markerInsertedAt ?? it.discussedAt;
      const relativeMs =
        markAt && anchor ? Math.max(0, markAt.getTime() - anchor.getTime()) : 0;
      return {
        id: it.id,
        name: it.displayName?.trim() || it.id.slice(0, 8),
        relativeMs,
      };
    })
    .sort((a, b) => a.relativeMs - b.relativeMs);

  if (!discussed.length) {
    return doc.plain?.trim() || null;
  }

  const sentences = doc.sentences ?? [];
  const sections: string[] = [];

  for (let i = 0; i < discussed.length; i++) {
    const cur = discussed[i]!;
    const next = discussed[i + 1];
    const start = cur.relativeMs;
    const end = next ? next.relativeMs : Number.POSITIVE_INFINITY;
    const texts = sentences
      .filter((s) => {
        const t = s.startTime ?? 0;
        return t >= start && t < end;
      })
      .map((s) => s.text.trim())
      .filter(Boolean);
    sections.push(`=== ${cur.name} ===\n${texts.join("\n") || "（本段暂无转写）"}`);
  }

  // 打点前的开场内容
  const firstMs = discussed[0]!.relativeMs;
  const preamble = sentences
    .filter((s) => (s.startTime ?? 0) < firstMs)
    .map((s) => s.text.trim())
    .filter(Boolean);
  if (preamble.length) {
    sections.unshift(`=== 开场 ===\n${preamble.join("\n")}`);
  }

  return sections.join("\n\n");
}
