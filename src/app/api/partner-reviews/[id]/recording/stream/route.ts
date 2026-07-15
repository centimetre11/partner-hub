import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { appendFinalTranscriptSentence } from "@/lib/asr/xfyun-stream-writer";

export const runtime = "nodejs";

type StreamBody = {
  text?: string;
  startMs?: number;
  endMs?: number;
  final?: boolean;
};

/** 追加讯飞实时转写句子到会议时间轴（备用；主路径由 relay 服务端写入） */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (meeting.status === "DONE") {
    return NextResponse.json({ error: "已完成会议不可再转写" }, { status: 400 });
  }

  const body = (await req.json()) as StreamBody;
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: true, skipped: true, plain: meeting.transcriptText ?? "" });
  }
  if (!body.final) {
    return NextResponse.json({ ok: true, preview: text });
  }

  const res = await appendFinalTranscriptSentence(meetingId, {
    text,
    startMs: body.startMs,
    endMs: body.endMs,
  });

  return NextResponse.json({
    ok: true,
    plain: res.plain,
    sentence: res.sentence,
    duplicate: res.duplicate,
  });
}
