import "server-only";

import { db } from "../db";
import { itemDisplayLabel } from "./types";

export type DiscussItemResult =
  | {
      ok: true;
      label: string;
      discussedAt: string;
      markerInsertedAt: string;
      relativeMs: number;
    }
  | { error: string };

export async function markItemDiscussed(
  meetingId: string,
  itemId: string,
): Promise<DiscussItemResult> {
  const item = await db.presalesProjectMeetingItem.findFirst({
    where: { id: itemId, meetingId },
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true } },
      project: { select: { name: true } },
      opportunity: { select: { name: true } },
      partner: { select: { name: true } },
      meeting: true,
    },
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
  const label = itemDisplayLabel({
    userName: item.user.name,
    subjectKind: item.subjectKind,
    customerName: item.customer?.name ?? null,
    projectName: item.project?.name ?? null,
    opportunityName: item.opportunity?.name ?? null,
    partnerName: item.partner?.name ?? null,
  });

  await db.$transaction([
    db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: { startedAt: item.meeting.startedAt ?? now },
    }),
    db.presalesProjectMeetingItem.update({
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
    label,
    discussedAt: (item.discussedAt ?? now).toISOString(),
    markerInsertedAt: markerInsertedAt.toISOString(),
    relativeMs: now.getTime() - anchor.getTime(),
  };
}
