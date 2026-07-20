import "server-only";

import { randomUUID } from "crypto";
import WebSocket from "ws";
import {
  buildTimedTranscriptDoc,
  serializeTimedTranscriptDoc,
  type TimedTranscriptDoc,
  type TranscriptSentence,
} from "../partner-review/transcript";
import {
  buildXfyunRealtimeWsUrl,
  getXfyunAsrConfig,
  parseXfyunAsrMessage,
} from "./xfyun";

const FRAME_BYTES = 1280;
const FRAME_MS = 40;

/** 从 WAV(PCM16 LE mono) 抽出 PCM；若非标准 WAV 则原样当作 PCM */
export function extractPcmFromWavOrPcm(buf: Buffer): { pcm: Buffer; sampleRate: number } {
  if (buf.length >= 44 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    let offset = 12;
    let sampleRate = 16000;
    let dataOffset = -1;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      const body = offset + 8;
      if (id === "fmt " && body + 16 <= buf.length) {
        sampleRate = buf.readUInt32LE(body + 4);
      }
      if (id === "data") {
        dataOffset = body;
        dataSize = size;
        break;
      }
      offset = body + size + (size % 2);
    }
    if (dataOffset >= 0) {
      return {
        pcm: buf.subarray(dataOffset, dataOffset + Math.min(dataSize, buf.length - dataOffset)),
        sampleRate,
      };
    }
  }
  return { pcm: buf, sampleRate: 16000 };
}

/** 线性重采样到 16kHz mono PCM16 */
export function resamplePcm16Mono(pcm: Buffer, fromRate: number, toRate = 16000): Buffer {
  if (fromRate === toRate || pcm.length < 2) return pcm;
  const inSamples = pcm.length / 2;
  const outSamples = Math.max(1, Math.floor((inSamples * toRate) / fromRate));
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const src = (i * fromRate) / toRate;
    const i0 = Math.floor(src);
    const i1 = Math.min(inSamples - 1, i0 + 1);
    const frac = src - i0;
    const s0 = pcm.readInt16LE(i0 * 2);
    const s1 = pcm.readInt16LE(i1 * 2);
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2);
  }
  return out;
}

/**
 * 会后一次性：把整段 PCM 喂给讯飞 RTASR，得到带相对时间轴的转写。
 * 不实时；录音起点 = 0ms，可与 recordingStartedAt + markerInsertedAt 对齐。
 */
export async function transcribePcmWithXfyunBatch(opts: {
  pcm: Buffer;
  sampleRate?: number;
  recordingStartedAt?: Date | null;
  timeoutMs?: number;
}): Promise<TimedTranscriptDoc> {
  const cfg = getXfyunAsrConfig();
  if (!cfg.enabled) {
    throw new Error("未配置讯飞 XFYUN_APP_ID / API_KEY / API_SECRET");
  }

  let pcm = opts.pcm;
  const fromRate = opts.sampleRate ?? 16000;
  if (fromRate !== 16000) {
    pcm = resamplePcm16Mono(pcm, fromRate, 16000);
  }

  const sentences: TranscriptSentence[] = [];
  let audioMsSent = 0;
  let interim = "";
  let closed = false;
  let rejectErr: Error | null = null;

  const url = buildXfyunRealtimeWsUrl({
    appId: cfg.appId,
    apiKey: cfg.apiKey,
    apiSecret: cfg.apiSecret,
    lang: cfg.lang,
    pd: cfg.pd,
    vadMdn: cfg.vadMdn,
    uuid: randomUUID().replace(/-/g, ""),
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      rejectErr = new Error("讯飞一次性转写超时");
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(rejectErr);
    }, opts.timeoutMs ?? 600_000);

    const ws = new WebSocket(url);

    const finish = (err?: Error) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    ws.on("open", () => {
      let offset = 0;
      const sendNext = () => {
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        if (offset >= pcm.length) {
          try {
            ws.send(JSON.stringify({ end: true }));
          } catch {
            /* ignore */
          }
          return;
        }
        const end = Math.min(offset + FRAME_BYTES, pcm.length);
        const frame = pcm.subarray(offset, end);
        offset = end;
        // 末帧不足 1280 时补零，讯飞更稳
        const payload =
          frame.length === FRAME_BYTES
            ? frame
            : Buffer.concat([frame, Buffer.alloc(FRAME_BYTES - frame.length)]);
        ws.send(payload);
        audioMsSent += FRAME_MS;
        // 会后一次性：尽快喂完，不必按实时 40ms 节拍（否则 1 小时会开 1 小时）
        setImmediate(sendNext);
      };
      sendNext();
    });

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const parsed = parseXfyunAsrMessage(raw);
      if (!parsed) return;
      if (parsed.error) {
        finish(new Error(parsed.error));
        return;
      }
      if (parsed.isFinal && parsed.text) {
        interim = "";
        const xfyunDur =
          parsed.endMs != null && parsed.startMs != null
            ? Math.max(200, parsed.endMs - parsed.startMs)
            : 2000;
        const endMs = audioMsSent;
        const startMs = Math.max(0, endMs - xfyunDur);
        const last = sentences[sentences.length - 1];
        if (last && last.text === parsed.text && Math.abs((last.startTime || 0) - startMs) < 500) {
          return;
        }
        sentences.push({
          startTime: parsed.startMs != null ? parsed.startMs : startMs,
          endTime: parsed.endMs != null ? parsed.endMs : endMs,
          text: parsed.text,
        });
      } else if (parsed.text) {
        interim = parsed.text;
      }
      if (parsed.isLastFrame) {
        finish();
      }
    });

    ws.on("error", (e) => finish(e instanceof Error ? e : new Error(String(e))));
    ws.on("close", () => {
      if (interim.trim()) {
        sentences.push({ startTime: Math.max(0, audioMsSent - 2000), text: interim.trim() });
      }
      finish();
    });
  });

  if (!sentences.length) {
    throw new Error("讯飞未识别到有效语音，请确认录到了会议声音");
  }

  // 统一成相对录音起点的 ms；若讯飞 bg 异常偏大，回退到我们累计的 audioMs
  const normalized = sentences.map((s, i) => {
    let start = Number(s.startTime) || 0;
    if (start > audioMsSent + 60_000) {
      start = Math.max(0, (audioMsSent * i) / Math.max(1, sentences.length));
    }
    return { ...s, startTime: start };
  });

  return buildTimedTranscriptDoc({
    sentences: normalized,
    timeBase: "relative_ms",
    recordingStartedAt: opts.recordingStartedAt ?? null,
  });
}

export function serializeBatchDoc(doc: TimedTranscriptDoc): string {
  return serializeTimedTranscriptDoc(doc);
}
