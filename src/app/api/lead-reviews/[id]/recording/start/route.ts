import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 开始本地一次性录音：锚定 recordingStartedAt = now。
 * 此后会中打点（markerInsertedAt）相对该时刻，可与讯飞转写 relative_ms 对齐。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const meeting = await db.leadReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (meeting.status === "DONE") {
    return NextResponse.json({ error: "已完成会议不可开录" }, { status: 400 });
  }

  const now = new Date();
  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: {
      recordingStartedAt: now,
      recordingEndedAt: null,
      transcriptStatus: "recording",
      transcriptError: null,
      status: meeting.status === "DRAFT" || meeting.status === "PREP" ? "LIVE" : meeting.status,
      startedAt: meeting.startedAt ?? now,
    },
  });

  return NextResponse.json({ ok: true, startedAt: now.toISOString() });
}
