"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWavMono, rmsLevel, sliceLastSeconds } from "@/lib/asr/wav";

type Props = {
  meetingId: string;
  transcriptStatus: string | null;
  recordingBytes: number | null;
  transcriptError: string | null;
  realtimeEnabled?: boolean;
  chunkSeconds?: number;
  disabled?: boolean;
  onFlash: (ok?: string, err?: string) => void;
  onUploaded: () => void;
  onMeetingLive: () => void;
  onLiveTranscript?: (plain: string) => void;
  onRecordingChange?: (recording: boolean) => void;
};

type Phase = "idle" | "mic" | "recording" | "uploading" | "error";

function formatTime(sec: number) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function MeetingLocalRecorder({
  meetingId,
  transcriptStatus,
  recordingBytes,
  transcriptError,
  realtimeEnabled = true,
  chunkSeconds = 8,
  disabled,
  onFlash,
  onUploaded,
  onMeetingLive,
  onLiveTranscript,
  onRecordingChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [statusLine, setStatusLine] = useState("未开始录音");
  const [localError, setLocalError] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [lastChunkPreview, setLastChunkPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const liveLoopRef = useRef<number | null>(null);
  const liveBusyRef = useRef(false);
  const stoppedRef = useRef(false);
  const offsetMsRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const levelTimerRef = useRef<number | null>(null);

  const recording = phase === "recording";
  const chunkSec = Math.min(20, Math.max(5, chunkSeconds || 8));

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardown() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (liveLoopRef.current) window.clearTimeout(liveLoopRef.current);
    if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
    timerRef.current = null;
    liveLoopRef.current = null;
    levelTimerRef.current = null;
    try {
      processorRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    pcmChunksRef.current = [];
  }

  function flattenPcm(): Float32Array {
    const chunks = pcmChunksRef.current;
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Float32Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  function startPcmCapture(stream: MediaStream) {
    const ctx = new AudioContext();
    sampleRateRef.current = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    pcmChunksRef.current = [];
    processor.onaudioprocess = (e) => {
      if (stoppedRef.current) return;
      const input = e.inputBuffer.getChannelData(0);
      pcmChunksRef.current.push(new Float32Array(input));
      // 限制内存：最多保留约 90 分钟
      const maxSamples = sampleRateRef.current * 60 * 90;
      let total = 0;
      for (const c of pcmChunksRef.current) total += c.length;
      while (total > maxSamples && pcmChunksRef.current.length > 1) {
        const dropped = pcmChunksRef.current.shift();
        total -= dropped?.length ?? 0;
      }
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    audioCtxRef.current = ctx;
    processorRef.current = processor;

    if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
    levelTimerRef.current = window.setInterval(() => {
      const flat = flattenPcm();
      const recent = sliceLastSeconds(flat, sampleRateRef.current, 0.4);
      setLevel(Math.min(1, rmsLevel(recent) * 4));
    }, 200);
  }

  async function uploadLiveChunk(blob: Blob, offsetMs: number) {
    liveBusyRef.current = true;
    setStatusLine(`正在识别第 ${chunkCount + 1} 段（约 ${chunkSec}s 音频）…`);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 120_000);
    try {
      const form = new FormData();
      form.append("file", new File([blob], `chunk-${offsetMs}.wav`, { type: "audio/wav" }));
      form.append("offsetMs", String(offsetMs));
      const res = await fetch(`/api/partner-reviews/${meetingId}/recording/live`, {
        method: "POST",
        body: form,
        signal: ctrl.signal,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        plain?: string;
        chunkText?: string;
        skipped?: boolean;
      };
      if (!res.ok) {
        const tip = (data.error || res.statusText).slice(0, 160);
        setLocalError(`实时转写失败：${tip}`);
        setStatusLine(`实时失败：${tip.slice(0, 60)}`);
        return;
      }
      if (data.skipped) {
        setStatusLine("本段过短已跳过，继续录音…");
        return;
      }
      setLocalError(null);
      if (data.plain != null) onLiveTranscript?.(data.plain);
      setChunkCount((n) => n + 1);
      const preview = (data.chunkText || "").trim();
      setLastChunkPreview(preview ? preview.slice(0, 100) : "（本段无有效语音）");
      setStatusLine(
        preview
          ? `实时已更新 · ${preview.slice(0, 40)}${preview.length > 40 ? "…" : ""}`
          : "实时已更新（本段静音）",
      );
    } catch (e) {
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "识别超时（模型可能仍在加载，请稍后再试或点停止后精修转写）"
          : e instanceof Error
            ? e.message
            : "网络异常";
      setStatusLine(`实时异常：${msg}`);
      setLocalError(msg);
    } finally {
      window.clearTimeout(timer);
      liveBusyRef.current = false;
    }
  }

  async function captureLiveSegment() {
    if (stoppedRef.current || !realtimeEnabled) return;
    if (liveBusyRef.current) {
      scheduleLiveLoop(1500);
      return;
    }

    const flat = flattenPcm();
    const slice = sliceLastSeconds(flat, sampleRateRef.current, chunkSec);
    if (slice.length < sampleRateRef.current * 1.5) {
      setStatusLine("录音中 · 采集不足，继续…");
      scheduleLiveLoop(1000);
      return;
    }

    const levelNow = rmsLevel(slice);
    const offsetMs = offsetMsRef.current;
    offsetMsRef.current = offsetMs + chunkSec * 1000;

    if (levelNow < 0.008) {
      setStatusLine("录音中 · 本段几乎无声，已跳过（请靠近麦克风）");
      scheduleLiveLoop(500);
      return;
    }

    const blob = encodeWavMono(slice, sampleRateRef.current);
    await uploadLiveChunk(blob, offsetMs);
    if (!stoppedRef.current) scheduleLiveLoop(400);
  }

  function scheduleLiveLoop(delayMs: number) {
    if (liveLoopRef.current) window.clearTimeout(liveLoopRef.current);
    liveLoopRef.current = window.setTimeout(() => {
      void captureLiveSegment();
    }, delayMs);
  }

  async function start() {
    if (busy || recording || disabled) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const msg = "需要 HTTPS 才能使用麦克风";
      setLocalError(msg);
      setPhase("error");
      onFlash(undefined, msg);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "浏览器不支持麦克风，请用 Chrome / Edge";
      setLocalError(msg);
      setPhase("error");
      onFlash(undefined, msg);
      return;
    }

    setBusy(true);
    setPhase("mic");
    setLocalError(null);
    setStatusLine("正在请求麦克风权限…");
    stoppedRef.current = false;
    offsetMsRef.current = 0;
    setChunkCount(0);
    setLastChunkPreview(null);
    setElapsedSec(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Route Handler，避免 Server Action 哈希失效
      const markRes = await fetch(`/api/partner-reviews/${meetingId}/recording/start`, {
        method: "POST",
      });
      const mark = (await markRes.json()) as { ok?: boolean; error?: string; startedAt?: string };
      if (!markRes.ok || mark.error) {
        stream.getTracks().forEach((t) => t.stop());
        const msg = mark.error || `开录失败 HTTP ${markRes.status}`;
        setLocalError(msg);
        setPhase("error");
        setStatusLine("开录失败");
        onFlash(undefined, msg);
        return;
      }
      startedAtRef.current = mark.startedAt ?? new Date().toISOString();
      onMeetingLive();

      startPcmCapture(stream);

      setPhase("recording");
      setStatusLine(
        realtimeEnabled
          ? `录音中 · 每 ${chunkSec}s 识别一段（首次可能较慢，需加载模型）`
          : "录音中 · 结束后再转写",
      );
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);

      if (realtimeEnabled) {
        // 先采满一段再识别
        scheduleLiveLoop(chunkSec * 1000 + 300);
      }

      onFlash("录音已开始。请对着麦克风说话；左侧讨论谁点谁。");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      let msg = e instanceof Error ? e.message : "无法打开麦克风";
      if (name === "NotAllowedError" || /Permission|NotAllowed/i.test(msg)) {
        msg = "麦克风权限被拒绝，请在地址栏允许后重试";
      }
      setLocalError(msg);
      setPhase("error");
      setStatusLine("开录失败");
      onFlash(undefined, msg);
      teardown();
    } finally {
      setBusy(false);
    }
  }

  async function stopAndUpload() {
    if (!streamRef.current && !audioCtxRef.current) return;
    setBusy(true);
    setPhase("uploading");
    setStatusLine("正在停止并上传整段 WAV…");
    stoppedRef.current = true;
    if (liveLoopRef.current) {
      window.clearTimeout(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (levelTimerRef.current) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }

    try {
      try {
        processorRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      processorRef.current = null;

      const flat = flattenPcm();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;

      if (flat.length < sampleRateRef.current * 1.2) {
        const msg = "录音过短，请重新录并确保麦克风有声音";
        setLocalError(msg);
        setPhase("error");
        setStatusLine("上传失败");
        onFlash(undefined, msg);
        return;
      }

      const blob = encodeWavMono(flat, sampleRateRef.current);
      const form = new FormData();
      form.append("file", new File([blob], `meeting-${meetingId}.wav`, { type: "audio/wav" }));
      form.append("startedAt", startedAtRef.current || new Date().toISOString());
      form.append("endedAt", new Date().toISOString());

      const res = await fetch(`/api/partner-reviews/${meetingId}/recording`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; bytes?: number };
      if (!res.ok || data.error) {
        const msg = data.error || `上传失败 HTTP ${res.status}`;
        setLocalError(msg);
        setPhase("error");
        setStatusLine("上传失败");
        onFlash(undefined, msg);
        return;
      }

      setPhase("idle");
      setLevel(0);
      setStatusLine(
        `录音已保存 ${Math.round((data.bytes ?? blob.size) / 1024)} KB · 实时 ${chunkCount} 段 · 可精修转写`,
      );
      onFlash(`录音已上传。可点「精修转写」或直接「AI 拆分」。`);
      onUploaded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "上传失败";
      setLocalError(msg);
      setPhase("error");
      setStatusLine("上传失败");
      onFlash(undefined, msg);
      teardown();
    } finally {
      setBusy(false);
    }
  }

  async function runAsr() {
    setBusy(true);
    setStatusLine("整段精修转写中（CPU 首次可能需 1–2 分钟）…");
    try {
      const res = await fetch(`/api/partner-reviews/${meetingId}/recording/transcribe`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || data.error) {
        setLocalError(data.error || `转写失败 HTTP ${res.status}`);
        setStatusLine("转写失败");
        onFlash(undefined, data.error || `转写失败 HTTP ${res.status}`);
      } else {
        setLocalError(null);
        setStatusLine(data.message || "转写完成");
        onFlash(data.message);
        onUploaded();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLocalError(msg);
      setStatusLine("转写失败");
      onFlash(undefined, msg);
    } finally {
      setBusy(false);
    }
  }

  const hasAudio =
    !!recordingBytes || transcriptStatus === "uploaded" || transcriptStatus === "ready";
  const errText = localError || transcriptError;
  const levelPct = Math.round(level * 100);

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-3 ${
        recording
          ? "border-rose-300 bg-rose-50/90 shadow-sm"
          : phase === "error"
            ? "border-red-200 bg-red-50/70"
            : phase === "uploading"
              ? "border-amber-200 bg-amber-50/70"
              : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {recording ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
              </span>
            ) : null}
            <h4 className="text-sm font-semibold text-slate-900">
              {recording
                ? "正在录音"
                : phase === "uploading"
                  ? "正在上传录音"
                  : phase === "mic"
                    ? "请求麦克风权限"
                    : "会议录音"}
            </h4>
            {recording ? (
              <span className="font-mono text-sm font-medium text-rose-800 tabular-nums">
                {formatTime(elapsedSec)}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{statusLine}</p>
          {recording ? (
            <p className="text-[11px] text-rose-800/80">
              请保持本页打开；讨论到谁就点左侧谁。右侧转写区会按段更新（非逐字，约每 {chunkSec}{" "}
              秒一段）。
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!recording && phase !== "uploading" && phase !== "mic" ? (
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void start()}
              className="rounded-lg bg-rose-700 text-white px-3.5 py-2 text-sm font-medium hover:bg-rose-800 disabled:opacity-40"
            >
              {hasAudio ? "重新录音" : "开始近实时录音"}
            </button>
          ) : null}
          {recording ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void stopAndUpload()}
              className="rounded-lg bg-slate-900 text-white px-3.5 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
            >
              停止并上传
            </button>
          ) : null}
          {hasAudio && !recording && phase !== "uploading" ? (
            <button
              type="button"
              disabled={busy || transcriptStatus === "transcribing"}
              onClick={() => void runAsr()}
              className="rounded-lg bg-violet-700 text-white px-3.5 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
            >
              {transcriptStatus === "transcribing" ? "转写中…" : "精修转写（整段）"}
            </button>
          ) : null}
        </div>
      </div>

      {recording ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>麦克风电平</span>
            <span>{levelPct < 3 ? "几乎无声 — 请靠近麦克风说话" : `音量 ${levelPct}%`}</span>
          </div>
          <div className="h-2 rounded-full bg-white/80 border border-rose-100 overflow-hidden">
            <div
              className={`h-full transition-[width] duration-100 ${
                levelPct < 3 ? "bg-amber-400" : "bg-rose-500"
              }`}
              style={{ width: `${Math.max(2, levelPct)}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>
              已识别 {chunkCount} 段 · 下一段约 {chunkSec}s
            </span>
            {recordingBytes ? <span>历史文件 {Math.round(recordingBytes / 1024)} KB</span> : null}
          </div>
          {lastChunkPreview ? (
            <p className="text-xs text-violet-900 bg-white/70 border border-violet-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
              最新识别：{lastChunkPreview}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              {realtimeEnabled
                ? `首段约 ${chunkSec} 秒后出现；若首次使用，服务端加载模型可能再等几十秒`
                : "已关闭近实时"}
            </p>
          )}
        </div>
      ) : null}

      {errText ? (
        <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {errText}
        </div>
      ) : null}

      {!recording && phase === "idle" && !hasAudio ? (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          使用 Chrome/Edge + HTTPS。开录后请对着麦克风说话；这是「近实时分段识别」，不是逐字字幕。
        </p>
      ) : null}
    </div>
  );
}
