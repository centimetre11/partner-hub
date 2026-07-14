import "server-only";

import { db } from "../db";
import { getAsrConfig } from "./config";
import { correctTranscriptWithLexicon } from "./correct";
import { resolveAsrLexicon } from "./lexicon";
import { buildLexiconPrompt, isLikelyAsrPromptLeak, stripAsrPromptArtifacts } from "./types";
import { readMeetingRecording } from "./recording-store";
import { transcribeWithAsr } from "./transcribe";
import {
  buildTimedTranscriptDoc,
  serializeTimedTranscriptDoc,
} from "../partner-review/transcript";

/** 对已上传的会议录音跑 ASR + 伙伴名纠偏，写入 transcript* 字段 */
export async function runMeetingAsrPipeline(meetingId: string, userId?: string) {
  const cfg = getAsrConfig();
  if (!cfg.enabled) {
    throw new Error("未配置 ASR_BASE_URL（whisper-asr-webservice 地址）");
  }

  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { partner: { select: { name: true } } },
      },
    },
  });
  if (!meeting) throw new Error("会议不存在");
  if (!meeting.recordingPath) throw new Error("尚无录音文件，请先在会中录音并上传");

  const lexicon = await resolveAsrLexicon();

  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: { transcriptStatus: "transcribing", transcriptError: null },
  });

  try {
    const audio = await readMeetingRecording(meeting.recordingPath);
    const partnerNames = meeting.items.map((it) => it.partner.name);
    const filename = meeting.recordingPath.split(/[/\\]/).pop() || "meeting.webm";
    let doc = await transcribeWithAsr({
      audio,
      filename,
      mimeType: meeting.recordingMimeType ?? undefined,
      language: lexicon.language || cfg.language,
      initialPrompt: buildLexiconPrompt({ lexicon, partnerNames }),
      recordingStartedAt: meeting.recordingStartedAt ?? meeting.startedAt,
    });
    doc = buildTimedTranscriptDoc({
      sentences: doc.sentences
        .map((s) => ({
          ...s,
          text: stripAsrPromptArtifacts(s.text),
        }))
        .filter((s) => s.text.trim() && !isLikelyAsrPromptLeak(s.text)),
      timeBase: doc.timeBase,
      recordingStartedAt: doc.recordingStartedAt,
    });
    doc = await correctTranscriptWithLexicon({ doc, partnerNames, lexicon, userId });

    await db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: {
        transcriptText: doc.plain,
        transcriptJson: serializeTimedTranscriptDoc(doc),
        transcriptStatus: "ready",
        transcriptError: null,
        status: meeting.status === "LIVE" ? "LIVE" : "PROCESSING",
        endedAt: meeting.endedAt ?? new Date(),
      },
    });

    return { ok: true as const, chars: doc.plain.length, sentences: doc.sentences.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.partnerReviewMeeting.update({
      where: { id: meetingId },
      data: { transcriptStatus: "error", transcriptError: msg.slice(0, 500) },
    });
    throw e;
  }
}
