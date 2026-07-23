import "server-only";

import path from "path";
import {
  buildTimedTranscriptDoc,
  serializeTimedTranscriptDoc,
  type TimedTranscriptDoc,
  type TranscriptSentence,
} from "../partner-review/transcript";
import {
  buildSignedQuery,
  formatDateTimeChina,
  getXfyunAsrConfig,
  IFASR_FAIL_TYPE,
  parseIfasrOrderResult,
  randomSignatureId,
} from "./xfyun";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function guessDurationMs(file: Buffer, fileName: string): number | undefined {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".wav" || ext === ".pcm" || !ext) {
    const { pcm, sampleRate } = extractPcmFromWavOrPcm(file);
    if (pcm.length >= 2 && sampleRate > 0) {
      return Math.max(1, Math.round((pcm.length / 2 / sampleRate) * 1000));
    }
  }
  return undefined;
}

type UploadResponse = {
  code?: string | number;
  descInfo?: string;
  content?: { orderId?: string; taskEstimateTime?: number };
};

type ResultResponse = {
  code?: string | number;
  descInfo?: string;
  content?: {
    orderResult?: string;
    taskEstimateTime?: number;
    orderInfo?: {
      orderId?: string;
      status?: number;
      failType?: number;
      originalDuration?: number;
    };
  };
};

function isOkCode(code: string | number | undefined): boolean {
  return code === "000000" || code === 0 || code === "0";
}

/**
 * 会后一次性：上传录音到讯飞「录音文件转写大模型」，轮询订单直至完成。
 * 录音起点 = 0ms，可与 recordingStartedAt + markerInsertedAt 对齐。
 */
export async function transcribeFileWithXfyunBatch(opts: {
  file: Buffer;
  fileName: string;
  durationMs?: number;
  recordingStartedAt?: Date | null;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<TimedTranscriptDoc> {
  const cfg = getXfyunAsrConfig();
  if (!cfg.enabled) {
    throw new Error("未配置讯飞 XFYUN_APP_ID / API_KEY / API_SECRET");
  }
  if (!opts.file.length) {
    throw new Error("录音文件为空");
  }

  const fileName = path.basename(opts.fileName || "meeting.wav") || "meeting.wav";
  const durationMs = opts.durationMs ?? guessDurationMs(opts.file, fileName);
  const signatureRandom = randomSignatureId(16);
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 3_000;
  const startedAt = Date.now();

  const uploadParams: Record<string, string> = {
    appId: cfg.appId,
    accessKeyId: cfg.apiKey,
    dateTime: formatDateTimeChina(),
    signatureRandom,
    fileSize: String(opts.file.length),
    fileName,
    language: cfg.language,
    audioMode: "fileStream",
  };
  if (durationMs != null && durationMs > 0) {
    uploadParams.duration = String(durationMs);
  } else {
    uploadParams.durationCheckDisable = "true";
  }
  if (cfg.pd) uploadParams.pd = cfg.pd;
  if (cfg.vadMdn) uploadParams.eng_vad_mdn = cfg.vadMdn;

  const { query: uploadQuery, signature: uploadSig } = buildSignedQuery({
    apiSecret: cfg.apiSecret,
    params: uploadParams,
  });

  const uploadUrl = `${cfg.apiHost}/v2/upload?${uploadQuery}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      signature: uploadSig,
    },
    body: new Uint8Array(opts.file),
  });
  const uploadText = await uploadRes.text();
  let uploadJson: UploadResponse;
  try {
    uploadJson = JSON.parse(uploadText) as UploadResponse;
  } catch {
    throw new Error(`讯飞上传响应无法解析：HTTP ${uploadRes.status} ${uploadText.slice(0, 200)}`);
  }
  if (!uploadRes.ok || !isOkCode(uploadJson.code)) {
    throw new Error(
      `讯飞上传失败：${uploadJson.descInfo || uploadJson.code || `HTTP ${uploadRes.status}`}`,
    );
  }
  const orderId = uploadJson.content?.orderId;
  if (!orderId) {
    throw new Error("讯飞上传成功但未返回 orderId");
  }

  let lastEstimate = uploadJson.content?.taskEstimateTime ?? 0;

  while (Date.now() - startedAt < timeoutMs) {
    const resultParams: Record<string, string> = {
      accessKeyId: cfg.apiKey,
      dateTime: formatDateTimeChina(),
      signatureRandom,
      orderId,
      resultType: "transfer",
    };
    const { query: resultQuery, signature: resultSig } = buildSignedQuery({
      apiSecret: cfg.apiSecret,
      params: resultParams,
    });
    const resultUrl = `${cfg.apiHost}/v2/getResult?${resultQuery}`;
    const resultRes = await fetch(resultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        signature: resultSig,
      },
      body: "{}",
    });
    const resultText = await resultRes.text();
    let resultJson: ResultResponse;
    try {
      resultJson = JSON.parse(resultText) as ResultResponse;
    } catch {
      throw new Error(`讯飞查询响应无法解析：HTTP ${resultRes.status} ${resultText.slice(0, 200)}`);
    }
    if (!resultRes.ok || !isOkCode(resultJson.code)) {
      throw new Error(
        `讯飞查询失败：${resultJson.descInfo || resultJson.code || `HTTP ${resultRes.status}`}`,
      );
    }

    const info = resultJson.content?.orderInfo;
    const status = info?.status;
    if (typeof resultJson.content?.taskEstimateTime === "number") {
      lastEstimate = resultJson.content.taskEstimateTime;
    }

    if (status === 4) {
      const orderResult = resultJson.content?.orderResult || "";
      if (!orderResult) {
        throw new Error("讯飞订单已完成但转写结果为空");
      }
      const parsed = parseIfasrOrderResult(orderResult);
      if (!parsed.length) {
        throw new Error("讯飞未识别到有效语音，请确认录到了会议声音");
      }
      const sentences: TranscriptSentence[] = parsed.map((s) => ({
        startTime: s.startMs,
        endTime: s.endMs,
        text: s.text,
      }));
      return buildTimedTranscriptDoc({
        sentences,
        timeBase: "relative_ms",
        recordingStartedAt: opts.recordingStartedAt ?? null,
      });
    }

    if (status === -1) {
      const failType = info?.failType ?? 99;
      const hint = IFASR_FAIL_TYPE[failType] || IFASR_FAIL_TYPE[99];
      throw new Error(`讯飞转写失败（failType=${failType}：${hint}）`);
    }

    // 0 已创建 / 3 处理中
    const wait = Math.min(
      pollIntervalMs,
      Math.max(1_000, lastEstimate > 0 ? Math.min(lastEstimate, 10_000) : pollIntervalMs),
    );
    await sleep(wait);
  }

  throw new Error("讯飞录音文件转写超时，请稍后重试");
}

/**
 * 兼容旧调用：从 PCM/WAV buffer 走录音文件转写大模型。
 * 优先按 WAV 原样上传；裸 PCM 则带 .pcm 后缀。
 */
export async function transcribePcmWithXfyunBatch(opts: {
  pcm: Buffer;
  sampleRate?: number;
  fileName?: string;
  recordingStartedAt?: Date | null;
  timeoutMs?: number;
}): Promise<TimedTranscriptDoc> {
  const isWav =
    opts.pcm.length >= 12 &&
    opts.pcm.toString("ascii", 0, 4) === "RIFF" &&
    opts.pcm.toString("ascii", 8, 12) === "WAVE";

  if (isWav) {
    return transcribeFileWithXfyunBatch({
      file: opts.pcm,
      fileName: opts.fileName || "meeting.wav",
      recordingStartedAt: opts.recordingStartedAt,
      timeoutMs: opts.timeoutMs,
    });
  }

  let pcm = opts.pcm;
  const fromRate = opts.sampleRate ?? 16000;
  if (fromRate !== 16000) {
    pcm = resamplePcm16Mono(pcm, fromRate, 16000);
  }
  const durationMs = Math.max(1, Math.round((pcm.length / 2 / 16000) * 1000));
  return transcribeFileWithXfyunBatch({
    file: pcm,
    fileName: opts.fileName || "meeting.pcm",
    durationMs,
    recordingStartedAt: opts.recordingStartedAt,
    timeoutMs: opts.timeoutMs,
  });
}

export function serializeBatchDoc(doc: TimedTranscriptDoc): string {
  return serializeTimedTranscriptDoc(doc);
}
