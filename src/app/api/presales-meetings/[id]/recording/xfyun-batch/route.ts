import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import path from "path";
import { readMeetingRecording } from "@/lib/asr/recording-store";
import { serializeBatchDoc, transcribeFileWithXfyunBatch } from "@/lib/asr/xfyun-batch";
import { getXfyunAsrConfig } from "@/lib/asr/xfyun";
import { materializeLiveNotesForMeeting } from "@/lib/presales-meeting/notes-materialize";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!getXfyunAsrConfig().enabled) {
    return NextResponse.json(
      { error: "未配置讯飞 XFYUN_APP_ID / API_KEY / API_SECRET（见 .env.example）" },
      { status: 400 },
    );
  }

  const { id: meetingId } = await ctx.params;
  const meeting = await db.presalesProjectMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (!meeting.recordingPath) {
    return NextResponse.json({ error: "尚未上传录音，请先结束录音并上传" }, { status: 400 });
  }

  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: { transcriptStatus: "transcribing", transcriptError: null },
  });

  try {
    const buf = await readMeetingRecording(meeting.recordingPath);
    const doc = await transcribeFileWithXfyunBatch({
      file: buf,
      fileName: path.basename(meeting.recordingPath) || "meeting.wav",
      recordingStartedAt: meeting.recordingStartedAt ?? meeting.startedAt,
    });
    const json = serializeBatchDoc(doc);

    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: {
        xfyunTranscriptText: doc.plain,
        xfyunTranscriptJson: json,
        transcriptText: doc.plain,
        transcriptJson: json,
        matchSource: "xfyun",
        transcriptStatus: "ready",
        transcriptError: null,
        recordingEndedAt: meeting.recordingEndedAt ?? new Date(),
      },
    });

    const { liveNotes, matchMethod } = await materializeLiveNotesForMeeting(meetingId);
    if (liveNotes) {
      await db.presalesProjectMeeting.update({
        where: { id: meetingId },
        data: { xfyunLiveNotes: liveNotes, liveNotes },
      });
    }

    return NextResponse.json({
      ok: true,
      chars: doc.plain.length,
      sentences: doc.sentences.length,
      liveNotes,
      matchMethod,
      plain: doc.plain,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.presalesProjectMeeting.update({
      where: { id: meetingId },
      data: { transcriptStatus: "error", transcriptError: msg.slice(0, 500) },
    });
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 500 });
  }
}
