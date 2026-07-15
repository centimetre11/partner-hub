import "server-only";

import { randomBytes } from "crypto";
import { db } from "../db";

export function newPreviewToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function ensureMeetingPreviewToken(meetingId: string): Promise<string> {
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { previewToken: true },
  });
  if (meeting?.previewToken) return meeting.previewToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newPreviewToken();
    try {
      await db.partnerReviewMeeting.update({
        where: { id: meetingId },
        data: { previewToken: token },
      });
      return token;
    } catch {
      const again = await db.partnerReviewMeeting.findUnique({
        where: { id: meetingId },
        select: { previewToken: true },
      });
      if (again?.previewToken) return again.previewToken;
    }
  }
  throw new Error("无法生成预览链接");
}

export async function getMeetingForPreview(token: string) {
  return db.partnerReviewMeeting.findUnique({
    where: { previewToken: token },
    include: {
      createdBy: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          partner: { select: { id: true, name: true, tier: true } },
        },
      },
    },
  });
}
