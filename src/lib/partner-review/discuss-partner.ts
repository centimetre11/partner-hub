import "server-only";

import { db } from "../db";

export type DiscussPartnerResult =
  | {
      ok: true;
      partnerName: string;
      discussedAt: string;
      markerInsertedAt: string;
      relativeMs: number;
    }
  | { error: string };

/** 会中点击伙伴：记录讨论顺序与时间（相对 startedAt，用于与腾讯会议纪要时间对齐） */
export async function markPartnerDiscussed(
  meetingId: string,
  itemId: string,
): Promise<DiscussPartnerResult> {
  const item = await db.partnerReviewItem.findFirst({
    where: { id: itemId, meetingId },
    include: { partner: { select: { id: true, name: true } }, meeting: true },
  });
  if (!item) return { error: "议程项不存在" };
  if (item.meeting.status !== "LIVE") {
    return { error: "请先点「开始开会」" };
  }

  const now = new Date();
  const anchor = item.meeting.startedAt ?? now;
  const existing = item.markerInsertedAt;
  const markerInsertedAt =
    existing && existing.getTime() >= anchor.getTime() ? existing : now;

  await db.$transaction([
    db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: {
        startedAt: item.meeting.startedAt ?? now,
      },
    }),
    db.partnerReviewItem.update({
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
    partnerName: item.partner.name,
    discussedAt: (item.discussedAt ?? now).toISOString(),
    markerInsertedAt: markerInsertedAt.toISOString(),
    relativeMs: now.getTime() - anchor.getTime(),
  };
}
