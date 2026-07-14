import "server-only";

import { getAsrConfig } from "./config";
import { resolveAsrLanguage } from "./types";
import {
  buildTimedTranscriptDoc,
  type TimedTranscriptDoc,
  type TranscriptSentence,
} from "../partner-review/transcript";

export type AsrTranscribeInput = {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  language?: string;
  /** 写入 Whisper initial_prompt，偏置伙伴名等专有名词 */
  initialPrompt?: string;
  recordingStartedAt?: Date | null;
};

function secondsToMs(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // whisper 段时间为秒；若已是 ms 则原样
  return n > 0 && n < 1e6 ? Math.round(n * 1000) : Math.round(n);
}

function segmentsToSentences(
  segments: Array<{ start?: number; end?: number; text?: string; speaker?: string }>,
): TranscriptSentence[] {
  return segments
    .map((s) => ({
      startTime: secondsToMs(s.start),
      endTime: s.end != null ? secondsToMs(s.end) : undefined,
      speaker: s.speaker?.trim() || undefined,
      text: String(s.text ?? "").trim(),
    }))
    .filter((s) => s.text);
}

/** 调用自托管 Whisper ASR，返回带时间轴的转写 */
export async function transcribeWithAsr(input: AsrTranscribeInput): Promise<TimedTranscriptDoc> {
  const cfg = getAsrConfig();
  if (!cfg.enabled) {
    throw new Error("未配置 ASR_BASE_URL。请部署 whisper-asr-webservice 并在环境变量中填写地址。");
  }

  if (cfg.provider === "openai_compatible") {
    return transcribeOpenAiCompatible(input, cfg);
  }
  return transcribeWhisperAsrWebservice(input, cfg);
}

async function transcribeWhisperAsrWebservice(
  input: AsrTranscribeInput,
  cfg: ReturnType<typeof getAsrConfig>,
): Promise<TimedTranscriptDoc> {
  const params = new URLSearchParams({
    task: "transcribe",
    output: "json",
    encode: "true",
    vad_filter: "true",
    word_timestamps: "false",
  });
  const lang = resolveAsrLanguage(input.language) ?? resolveAsrLanguage(cfg.language);
  if (lang) params.set("language", lang);
  if (input.initialPrompt?.trim()) {
    // 只做词汇偏置；过长更容易被复述
    params.set("initial_prompt", input.initialPrompt.trim().slice(0, 400));
  }

  const form = new FormData();
  const file = new File([new Uint8Array(input.audio)], input.filename || "meeting.webm", {
    type: input.mimeType || "application/octet-stream",
  });
  form.append("audio_file", file);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/asr?${params.toString()}`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const hint = /Invalid data|Failed to load audio|ffmpeg/i.test(errText)
        ? "（音频格式无法解码，请重新录音；近实时已改为 WAV）"
        : "";
      throw new Error(`ASR 失败 ${res.status}: ${errText.slice(0, 280)}${hint}`);
    }
    const raw = await res.text();
    let data: {
      text?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      // 少数版本直接返回纯文本
      return buildTimedTranscriptDoc({
        sentences: [{ startTime: 0, text: raw.trim() }],
        timeBase: "relative_ms",
        recordingStartedAt: input.recordingStartedAt,
      });
    }

    const sentences = segmentsToSentences(data.segments ?? []);
    if (sentences.length) {
      return buildTimedTranscriptDoc({
        sentences,
        timeBase: "relative_ms",
        recordingStartedAt: input.recordingStartedAt,
      });
    }
    const plain = String(data.text ?? "").trim();
    if (!plain) throw new Error("ASR 未返回文本");
    return buildTimedTranscriptDoc({
      sentences: [{ startTime: 0, text: plain }],
      timeBase: "relative_ms",
      recordingStartedAt: input.recordingStartedAt,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeOpenAiCompatible(
  input: AsrTranscribeInput,
  cfg: ReturnType<typeof getAsrConfig>,
): Promise<TimedTranscriptDoc> {
  const form = new FormData();
  const file = new File([new Uint8Array(input.audio)], input.filename || "meeting.webm", {
    type: input.mimeType || "application/octet-stream",
  });
  form.append("file", file);
  form.append("model", cfg.model);
  const lang = resolveAsrLanguage(input.language) ?? resolveAsrLanguage(cfg.language);
  if (lang) form.append("language", lang);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (input.initialPrompt?.trim()) {
    form.append("prompt", input.initialPrompt.trim().slice(0, 400));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: ctrl.signal,
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ASR 失败 ${res.status}: ${errText.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      text?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    const sentences = segmentsToSentences(data.segments ?? []);
    if (sentences.length) {
      return buildTimedTranscriptDoc({
        sentences,
        timeBase: "relative_ms",
        recordingStartedAt: input.recordingStartedAt,
      });
    }
    const plain = String(data.text ?? "").trim();
    if (!plain) throw new Error("ASR 未返回文本");
    return buildTimedTranscriptDoc({
      sentences: [{ startTime: 0, text: plain }],
      timeBase: "relative_ms",
      recordingStartedAt: input.recordingStartedAt,
    });
  } finally {
    clearTimeout(timer);
  }
}
