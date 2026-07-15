import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import {
  buildTimedTranscriptDoc,
  parseTimedTranscriptDoc,
  serializeTimedTranscriptDoc,
  type TranscriptSentence,
} from "@/lib/partner-review/transcript";

export const runtime = "nodejs";

type StreamBody = {
  text?: string;
  startMs?: number;
  endMs?: number;
  final?: boolean;
};

/** 追加讯飞实时转写句子到会议时间轴 */
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

  const startMs = Math.max(0, Number(body.startMs) || 0);
  const endMs = body.endMs != null ? Math.max(startMs, Number(body.endMs)) : undefined;

  const prev = parseTimedTranscriptDoc(meeting.transcriptJson);
  const prevSentences = prev?.sentences ?? [];

  // 避免重复追加相同终句
  const dup = prevSentences.some(
    (s) => s.text === text && Math.abs((s.startTime || 0) - startMs) < 500,
  );
  if (dup) {
    return NextResponse.json({ ok: true, plain: meeting.transcriptText ?? "", duplicate: true });
  }

  const newSentence: TranscriptSentence = {
    startTime: startMs,
    endTime: endMs,
    text,
  };

  const merged = buildTimedTranscriptDoc({
    sentences: [...prevSentences, newSentence],
    timeBase: "relative_ms",
    recordingStartedAt: meeting.recordingStartedAt ?? meeting.startedAt,
  });

  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      transcriptText: merged.plain,
      transcriptJson: serializeTimedTranscriptDoc(merged),
      transcriptStatus: "recording",
      transcriptError: null,
      status: meeting.status === "DRAFT" || meeting.status === "PREP" ? "LIVE" : meeting.status,
    },
  });

  return NextResponse.json({
    ok: true,
    plain: merged.plain,
    sentence: text,
    sentences: merged.sentences.length,
  });
}
