import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { materializeLiveNotesForMeeting } from "@/lib/partner-review/notes-materialize";

export const runtime = "nodejs";

/** 停止讯飞实时转写后：标记就绪并按议程打点生成记录本 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });

  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptStatus: meeting.transcriptText?.trim() ? "ready" : "idle",
      transcriptError: null,
    },
  });

  let liveNotes: string | null = null;
  if (meeting.transcriptText?.trim()) {
    liveNotes = await materializeLiveNotesForMeeting(meetingId);
  }

  return NextResponse.json({
    ok: true,
    liveNotes,
    hasTranscript: !!meeting.transcriptText?.trim(),
  });
}
