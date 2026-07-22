import "server-only";

import { db } from "../db";

export type DiscussLeadResult =
  | {
      ok: true;
      displayName: string;
      discussedAt: string;
      markerInsertedAt: string;
      relativeMs: number;
      liveNotes: string;
    }
  | { error: string };

/** 会中点击线索：标记正在讨论，并写入相对录音起点的打点 */
export async function markLeadDiscussed(
  meetingId: string,
  itemId: string,
): Promise<DiscussLeadResult> {
  const item = await db.leadReviewItem.findFirst({
    where: { id: itemId, meetingId },
    include: { meeting: true },
  });
  if (!item) return { error: "议程项不存在" };
  if (item.meeting.status !== "LIVE") {
    return { error: "请先点「开始开会」或开录" };
  }

  const now = new Date();
  const meeting = item.meeting;
  const anchor = meeting.recordingStartedAt ?? meeting.startedAt ?? now;
  const existing = item.markerInsertedAt;
  const markerInsertedAt =
    existing && existing.getTime() >= anchor.getTime() ? existing : now;

  const name = item.displayName?.trim() || item.id.slice(0, 8);
  const mm = String(Math.floor((now.getTime() - anchor.getTime()) / 60000)).padStart(2, "0");
  const ss = String(Math.floor(((now.getTime() - anchor.getTime()) % 60000) / 1000)).padStart(2, "0");
  const markerLine = `[${mm}:${ss}] 开始过 ${name}`;
  const nextNotes = meeting.liveNotes?.trim()
    ? meeting.liveNotes.includes(markerLine)
      ? meeting.liveNotes
      : `${meeting.liveNotes.trim()}\n${markerLine}`
    : markerLine;

  await db.$transaction([
    db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: {
        startedAt: meeting.startedAt ?? now,
        liveNotes: nextNotes,
      },
    }),
    db.leadReviewItem.update({
      where: { id: itemId },
      data: {
        status: item.status === "CONFIRMED" ? "CONFIRMED" : "DISCUSSED",
        discussedAt: item.discussedAt ?? now,
        markerInsertedAt,
      },
    }),
  ]);

  return {
    ok: true,
    displayName: name,
    discussedAt: (item.discussedAt ?? now).toISOString(),
    markerInsertedAt: markerInsertedAt.toISOString(),
    relativeMs: now.getTime() - anchor.getTime(),
    liveNotes: nextNotes,
  };
}
