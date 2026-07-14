import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { getAsrConfig } from "@/lib/asr/config";
import { resolveAsrLexicon } from "@/lib/asr/lexicon";
import { applyCorrectionRules, buildLexiconPrompt } from "@/lib/asr/types";
import { transcribeWithAsr } from "@/lib/asr/transcribe";
import {
  buildTimedTranscriptDoc,
  parseTimedTranscriptDoc,
  serializeTimedTranscriptDoc,
  type TranscriptSentence,
} from "@/lib/partner-review/transcript";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 近实时分片：上传一小段完整音频，追加到会议转写时间轴。
 * offsetMs = 该分片在整场录音中的起点。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const cfg = getAsrConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ error: "未配置 ASR_BASE_URL" }, { status: 400 });
  }

  const { id: meetingId } = await ctx.params;
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: { include: { partner: { select: { name: true } } } },
    },
  });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (meeting.status === "DONE") {
    return NextResponse.json({ error: "已完成会议不可再转写" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file" }, { status: 400 });
  }
  const offsetMs = Math.max(0, Number(form.get("offsetMs")) || 0);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 800) {
    return NextResponse.json({ ok: true, skipped: true, plain: meeting.transcriptText ?? "" });
  }

  const lexicon = await resolveAsrLexicon();
  const partnerNames = meeting.items.map((it) => it.partner.name);

  try {
    const filename = file.name || "chunk.wav";
    const mimeType =
      file.type ||
      (filename.endsWith(".wav")
        ? "audio/wav"
        : filename.endsWith(".webm")
          ? "audio/webm"
          : "application/octet-stream");
    const chunkDoc = await transcribeWithAsr({
      audio: buf,
      filename,
      mimeType,
      language: lexicon.language || cfg.language,
      initialPrompt: buildLexiconPrompt({ lexicon, partnerNames }),
      recordingStartedAt: meeting.recordingStartedAt ?? meeting.startedAt,
    });

    const newSentences: TranscriptSentence[] = chunkDoc.sentences.map((s) => ({
      startTime: offsetMs + (s.startTime || 0),
      endTime: s.endTime != null ? offsetMs + s.endTime : undefined,
      speaker: s.speaker,
      text: applyCorrectionRules(s.text, lexicon.correctionRules),
    }));

    const prev = parseTimedTranscriptDoc(meeting.transcriptJson);
    const merged = buildTimedTranscriptDoc({
      sentences: [...(prev?.sentences ?? []), ...newSentences].filter((s) => s.text.trim()),
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
      chunkText: newSentences.map((s) => s.text).join("\n"),
      plain: merged.plain,
      sentences: merged.sentences.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.slice(0, 400) }, { status: 500 });
  }
}
