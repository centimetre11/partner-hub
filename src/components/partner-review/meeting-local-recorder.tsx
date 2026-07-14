"use client";

import { useEffect, useRef, useState } from "react";
import {
  markLocalRecordingStartedAction,
  runLocalAsrAction,
} from "@/lib/partner-review/actions";
import { recordStreamToWav } from "@/lib/asr/wav";

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

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function formatTime(sec: number) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function stopRecorder(recorder: MediaRecorder): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];
    const type = recorder.mimeType || "audio/webm";
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("录音器错误"));
    recorder.onstop = () => resolve(new Blob(chunks, { type }));
    try {
      if (recorder.state === "recording") recorder.requestData();
      recorder.stop();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export function MeetingLocalRecorder({
  meetingId,
  transcriptStatus,
  recordingBytes,
  transcriptError,
  realtimeEnabled = true,
  chunkSeconds = 12,
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
  const masterRef = useRef<MediaRecorder | null>(null);
  const masterChunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");
  const startedAtRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const liveLoopRef = useRef<number | null>(null);
  const liveBusyRef = useRef(false);
  const stoppedRef = useRef(false);
  const offsetMsRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const recording = phase === "recording";

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
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    liveLoopRef.current = null;
    rafRef.current = null;
    try {
      if (masterRef.current && masterRef.current.state !== "inactive") masterRef.current.stop();
    } catch {
      /* ignore */
    }
    masterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function startLevelMeter(stream: MediaStream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current || stoppedRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* 电平仅辅助，失败可忽略 */
    }
  }

  async function uploadLiveChunk(blob: Blob, offsetMs: number, filename: string) {
    if (!realtimeEnabled || blob.size < 800) return;
    liveBusyRef.current = true;
    setStatusLine("分片转写中…");
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("offsetMs", String(offsetMs));
      const res = await fetch(`/api/partner-reviews/${meetingId}/recording/live`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        plain?: string;
        chunkText?: string;
        skipped?: boolean;
      };
      if (!res.ok) {
        const tip = (data.error || res.statusText).slice(0, 120);
        setLocalError(`实时转写失败：${tip}`);
        setStatusLine(`实时转写失败：${tip.slice(0, 48)}`);
        return;
      }
      if (data.skipped) {
        setStatusLine("录音中 · 分片过短已跳过");
        return;
      }
      setLocalError(null);
      if (data.plain != null) onLiveTranscript?.(data.plain);
      setChunkCount((n) => n + 1);
      const preview = (data.chunkText || "").trim();
      setLastChunkPreview(preview ? preview.slice(0, 80) : null);
      setStatusLine(
        preview
          ? `已出字 · ${preview.slice(0, 36)}${preview.length > 36 ? "…" : ""}`
          : "实时转写已更新",
      );
    } catch (e) {
      setStatusLine(`实时转写网络异常：${e instanceof Error ? e.message : "请检查网络"}`);
    } finally {
      liveBusyRef.current = false;
    }
  }

  /** PCM→WAV 分片给 Whisper（不打断主 WebM 录音；避免坏 WebM 导致 ASR 500） */
  async function captureLiveSegment() {
    const stream = streamRef.current;
    if (!stream || stoppedRef.current || !realtimeEnabled) return;
    if (liveBusyRef.current) {
      scheduleLiveLoop();
      return;
    }

    const offsetMs = offsetMsRef.current;
    const sec = Math.min(30, Math.max(8, chunkSeconds || 12));
    try {
      const { blob } = await recordStreamToWav(stream, sec * 1000);
      if (stoppedRef.current) return;
      offsetMsRef.current = offsetMs + sec * 1000;
      if (blob.size < 2000) {
        setStatusLine("录音中 · 本段几乎无声，已跳过");
      } else {
        await uploadLiveChunk(blob, offsetMs, `chunk-${offsetMs}.wav`);
      }
    } catch (e) {
      setStatusLine(`分片失败：${e instanceof Error ? e.message : String(e)}`);
    }
    if (!stoppedRef.current) scheduleLiveLoop();
  }

  function scheduleLiveLoop() {
    if (liveLoopRef.current) window.clearTimeout(liveLoopRef.current);
    // 立刻开下一轮（captureLiveSegment 内部已等待 chunkSeconds）
    liveLoopRef.current = window.setTimeout(() => {
      void captureLiveSegment();
    }, 200);
  }

  async function start() {
    if (busy || recording || disabled) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const msg = "当前页面不是安全上下文（需 HTTPS），浏览器禁止调用麦克风";
      setLocalError(msg);
      setPhase("error");
      onFlash(undefined, msg);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = "当前浏览器不支持麦克风录音，请用 Chrome / Edge 桌面版";
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
    masterChunksRef.current = [];
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
      mimeRef.current = pickMimeType();
      startLevelMeter(stream);

      const mark = await markLocalRecordingStartedAction(meetingId);
      if (mark.error) {
        stream.getTracks().forEach((t) => t.stop());
        setLocalError(mark.error);
        setPhase("error");
        setStatusLine("开录失败");
        onFlash(undefined, mark.error);
        return;
      }
      startedAtRef.current = mark.startedAt ?? new Date().toISOString();
      onMeetingLive();

      const mime = mimeRef.current;
      const master = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      masterChunksRef.current = [];
      master.ondataavailable = (e) => {
        if (e.data.size) masterChunksRef.current.push(e.data);
      };
      master.onerror = () => {
        setLocalError("主录音器异常中断");
        setStatusLine("录音异常");
      };
      masterRef.current = master;
      master.start(1000);

      setPhase("recording");
      setStatusLine(
        realtimeEnabled
          ? `录音中 · 约每 ${chunkSeconds}s 出一截字 · 讨论谁就点左侧谁`
          : "录音中 · 结束后再转写 · 讨论谁就点左侧谁",
      );
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);

      if (realtimeEnabled) {
        // 稍等再采第一片，避免开头静音无效请求
        liveLoopRef.current = window.setTimeout(() => void captureLiveSegment(), 1500);
      }

      onFlash("录音已开始。请对着麦克风说话；左侧按讨论顺序点伙伴。");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      let msg = e instanceof Error ? e.message : "无法打开麦克风";
      if (name === "NotAllowedError" || /Permission|NotAllowed/i.test(msg)) {
        msg = "麦克风权限被拒绝。请在浏览器地址栏允许麦克风后重试。";
      } else if (name === "NotFoundError") {
        msg = "未检测到麦克风设备。";
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
    if (!streamRef.current && !masterRef.current) return;
    setBusy(true);
    setPhase("uploading");
    setStatusLine("正在停止并上传录音…");
    stoppedRef.current = true;
    if (liveLoopRef.current) {
      window.clearTimeout(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    try {
      const master = masterRef.current;
      let blob: Blob;
      if (master && master.state !== "inactive") {
        blob = await stopRecorder(master);
      } else {
        const type = mimeRef.current || "audio/webm";
        blob = new Blob(masterChunksRef.current, { type });
      }
      masterRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;

      if (blob.size < 2048) {
        const msg = `录音文件过短（${blob.size} 字节）。请确认麦克风有声音后重新录。`;
        setLocalError(msg);
        setPhase("error");
        setStatusLine("上传失败");
        onFlash(undefined, msg);
        return;
      }

      const form = new FormData();
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      form.append("file", blob, `meeting-${meetingId}.${ext}`);
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
      setStatusLine(`录音已保存 ${Math.round((data.bytes ?? blob.size) / 1024)} KB · 可精修转写或直接 AI 拆分`);
      setLevel(0);
      onFlash(
        realtimeEnabled
          ? `录音已上传（${Math.round((data.bytes ?? blob.size) / 1024)} KB）。可点「精修转写」或直接「AI 拆分」。`
          : `录音已上传（${Math.round((data.bytes ?? blob.size) / 1024)} KB），请点「转写录音」。`,
      );
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
    setStatusLine("整段精修转写中，请稍候…");
    try {
      const res = await runLocalAsrAction(meetingId);
      if (res.error) {
        setLocalError(res.error);
        setStatusLine("转写失败");
        onFlash(undefined, res.error);
      } else {
        setLocalError(null);
        setStatusLine(res.message || "转写完成");
        onFlash(res.message);
        onUploaded();
      }
    } finally {
      setBusy(false);
    }
  }

  // 仅「已有录音文件/已转写」才显示「重新录音」；勿用 transcriptStatus=recording（开录瞬间服务端会写，但客户端可能已被掐断）
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
              请保持本页打开；讨论到哪位伙伴就点左侧哪位。右侧「近实时转写」会陆续出字。
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
              {hasAudio ? "重新录音" : realtimeEnabled ? "开始近实时录音" : "开始录音"}
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
              {transcriptStatus === "transcribing"
                ? "转写中…"
                : realtimeEnabled
                  ? "精修转写（整段）"
                  : "转写录音"}
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
            <span>实时分片 {chunkCount} 次</span>
            {recordingBytes ? <span>历史文件 {Math.round(recordingBytes / 1024)} KB</span> : null}
          </div>
          {lastChunkPreview ? (
            <p className="text-xs text-violet-900 bg-white/70 border border-violet-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
              最新识别：{lastChunkPreview}
              {lastChunkPreview.length >= 80 ? "…" : ""}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">
              {realtimeEnabled
                ? `等待首段识别（约 ${chunkSeconds} 秒后出现）…`
                : "已关闭近实时，结束后再转写"}
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
          点击「开始近实时录音」后浏览器会申请麦克风。请使用 HTTPS 与 Chrome/Edge；录音时勿关闭或刷新本页。
        </p>
      ) : null}
    </div>
  );
}
