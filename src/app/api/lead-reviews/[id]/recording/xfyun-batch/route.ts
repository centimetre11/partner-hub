import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { readMeetingRecording } from "@/lib/asr/recording-store";
import {
  extractPcmFromWavOrPcm,
  serializeBatchDoc,
  transcribePcmWithXfyunBatch,
} from "@/lib/asr/xfyun-batch";
import { getXfyunAsrConfig } from "@/lib/asr/xfyun";
import { materializeLeadReviewLiveNotesFromMatch } from "@/lib/lead-review/minutes-match";

export const runtime = "nodejs";
export const maxDuration = 600;

/** 会后一次性：用已上传录音走讯飞 RTASR，写入转写并按打点/匹配切段 */
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
  const meeting = await db.leadReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (!meeting.recordingPath) {
    return NextResponse.json({ error: "尚未上传录音，请先结束录音并上传" }, { status: 400 });
  }

  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: { transcriptStatus: "transcribing", transcriptError: null },
  });

  try {
    const buf = await readMeetingRecording(meeting.recordingPath);
    const { pcm, sampleRate } = extractPcmFromWavOrPcm(buf);
    const doc = await transcribePcmWithXfyunBatch({
      pcm,
      sampleRate,
      recordingStartedAt: meeting.recordingStartedAt ?? meeting.startedAt,
    });
    const json = serializeBatchDoc(doc);

    await db.leadReviewMeeting.update({
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

    const { liveNotes, matchMethod } = await materializeLeadReviewLiveNotesFromMatch(
      meetingId,
      uid,
    );
    if (liveNotes) {
      await db.leadReviewMeeting.update({
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
    await db.leadReviewMeeting.update({
      where: { id: meetingId },
      data: { transcriptStatus: "error", transcriptError: msg.slice(0, 500) },
    });
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 500 });
  }
}
