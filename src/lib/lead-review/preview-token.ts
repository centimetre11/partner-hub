import "server-only";

import { randomBytes } from "crypto";
import { db } from "../db";

export function newLeadReviewPreviewToken(): string {
  return randomBytes(18).toString("base64url");
}

export async function ensureLeadReviewPreviewToken(meetingId: string): Promise<string> {
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    select: { previewToken: true },
  });
  if (meeting?.previewToken) return meeting.previewToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newLeadReviewPreviewToken();
    try {
      await db.leadReviewMeeting.update({
        where: { id: meetingId },
        data: { previewToken: token },
      });
      return token;
    } catch {
      const again = await db.leadReviewMeeting.findUnique({
        where: { id: meetingId },
        select: { previewToken: true },
      });
      if (again?.previewToken) return again.previewToken;
    }
  }
  throw new Error("无法生成预览链接");
}

export async function getLeadReviewMeetingForPreview(token: string) {
  return db.leadReviewMeeting.findUnique({
    where: { previewToken: token },
    include: {
      createdBy: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export type LeadConfirmedSnapshot = {
  confirmedAt?: string;
  verdict?: string;
  coreNotes?: string;
  todos?: Array<{ title: string; detail?: string | null; dueDate?: string | null }>;
};

export function parseLeadConfirmedSnapshot(raw: string | null | undefined): LeadConfirmedSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as LeadConfirmedSnapshot;
  } catch {
    return null;
  }
}
