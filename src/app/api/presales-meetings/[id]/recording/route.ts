import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { maxUploadBytes, maxUploadMb } from "@/lib/assets";
import { saveMeetingRecording } from "@/lib/asr/recording-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const meeting = await db.presalesProjectMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (meeting.status === "DONE") {
    return NextResponse.json({ error: "已完成会议不可再上传录音" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file" }, { status: 400 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ error: `录音超过 ${maxUploadMb()}MB` }, { status: 400 });
  }

  const mime = file.type || "audio/webm";
  if (!mime.startsWith("audio/") && !mime.startsWith("video/") && mime !== "application/octet-stream") {
    return NextResponse.json({ error: `不支持的类型: ${mime}` }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await saveMeetingRecording({
    meetingId,
    buffer: buf,
    mimeType: mime,
    filename: file.name,
  });

  const startedRaw = String(form.get("startedAt") ?? "").trim();
  const endedRaw = String(form.get("endedAt") ?? "").trim();
  const startedAt = startedRaw
    ? new Date(startedRaw)
    : (meeting.recordingStartedAt ?? meeting.startedAt ?? new Date());
  const endedAt = endedRaw ? new Date(endedRaw) : new Date();

  await db.presalesProjectMeeting.update({
    where: { id: meetingId },
    data: {
      recordingPath: saved.relativePath,
      recordingMimeType: saved.mimeType,
      recordingBytes: saved.bytes,
      recordingStartedAt: startedAt,
      recordingEndedAt: endedAt,
      transcriptStatus: "uploaded",
      transcriptError: null,
      status: meeting.status === "DRAFT" || meeting.status === "PREP" ? "LIVE" : meeting.status,
      startedAt: meeting.startedAt ?? startedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    bytes: saved.bytes,
    mimeType: saved.mimeType,
    transcriptStatus: "uploaded",
  });
}
