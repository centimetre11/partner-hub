"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWavMono, meterLevel, rmsLevel, sliceLastSeconds } from "@/lib/asr/wav";

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
  /** 每一段新识别出的文字（写入会中记录本） */
  onLiveTranscript?: (chunkText: string) => void;
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
  /** 默认开启：远程会议居多，开录时会弹共享屏幕以采集会议声音 */
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);
  const [quietHint, setQuietHint] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
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
  const quietStreakRef = useRef(0);
  const liveAbortRef = useRef<AbortController | null>(null);

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
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    pcmChunksRef.current = [];
    quietStreakRef.current = 0;
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

  function startPcmCapture(sources: { stream: MediaStream; gain: number }[]) {
    const ctx = new AudioContext();
    sampleRateRef.current = ctx.sampleRate;
    const mix = ctx.createGain();
    mix.gain.value = 1;
    for (const { stream, gain } of sources) {
      if (stream.getAudioTracks().length === 0) continue;
      const g = ctx.createGain();
      g.gain.value = gain;
      ctx.createMediaStreamSource(stream).connect(g);
      g.connect(mix);
    }
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    pcmChunksRef.current = [];
    quietStreakRef.current = 0;
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
    mix.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    audioCtxRef.current = ctx;
    processorRef.current = processor;

    if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
    levelTimerRef.current = window.setInterval(() => {
      const flat = flattenPcm();
      const recent = sliceLastSeconds(flat, sampleRateRef.current, 0.4);
      const m = meterLevel(recent);
      setLevel(m);
      // 连续约 4s 才提示「几乎无声」，避免正常说话被误判
      if (m < 0.04) {
        quietStreakRef.current += 1;
        if (quietStreakRef.current >= 20) setQuietHint(true);
      } else {
        quietStreakRef.current = 0;
        setQuietHint(false);
      }
    }, 200);
  }

  async function uploadLiveChunk(blob: Blob, offsetMs: number) {
    liveBusyRef.current = true;
    setStatusLine(`正在识别第 ${chunkCount + 1} 段（约 ${chunkSec}s 音频）…`);
    liveAbortRef.current?.abort();
    const ctrl = new AbortController();
    liveAbortRef.current = ctrl;
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
      if (stoppedRef.current) return;
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
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
      const preview = (data.chunkText || "").trim();
      if (preview) onLiveTranscript?.(preview);
      setChunkCount((n) => n + 1);
      setLastChunkPreview(preview ? preview.slice(0, 100) : "（本段无有效语音）");
      setStatusLine(
        preview
          ? `已写入记录本 · ${preview.slice(0, 40)}${preview.length > 40 ? "…" : ""}`
          : "本段无有效语音，继续录音…",
      );
    } catch (e) {
      if (stoppedRef.current) return;
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "本段识别超时（模型可能仍在加载），将继续下一段"
          : e instanceof Error
            ? e.message
            : "网络异常";
      setStatusLine(`实时异常：${msg}`);
      // 超时不占大红块，避免与状态行重复；停止上传时也不再刷错误
      if (!(e instanceof Error && e.name === "AbortError")) {
        setLocalError(msg);
      }
    } finally {
      window.clearTimeout(timer);
      if (liveAbortRef.current === ctrl) liveAbortRef.current = null;
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

    // 仅跳过真正接近零的空段；阈值放宽，避免大声说话仍被跳过
    if (levelNow < 0.0015) {
      setStatusLine("录音中 · 本段接近静音，已跳过");
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
    setQuietHint(false);
    setStatusLine(
      captureSystemAudio
        ? "正在请求麦克风，并将弹出「共享屏幕」以采集会议声音…"
        : "正在请求麦克风权限…",
    );
    stoppedRef.current = false;
    offsetMsRef.current = 0;
    setChunkCount(0);
    setLastChunkPreview(null);
    setElapsedSec(0);

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          // 强降噪会把电平压得很低，导致误报「几乎无声」
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = micStream;

      let displayStream: MediaStream | null = null;
      if (captureSystemAudio) {
        try {
          // 浏览器要求同时申请 video；立刻停画面轨，只留音频。
          // Mac/Chrome：必须选「Chrome 标签页」并勾选「分享音频」；选窗口/整屏通常没有音频轨。
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            // Chrome 扩展字段：尽量露出「分享音频」
            preferCurrentTab: false,
            systemAudio: "include",
          } as DisplayMediaStreamOptions);
          displayStream.getVideoTracks().forEach((t) => t.stop());
          if (displayStream.getAudioTracks().length === 0) {
            displayStream.getTracks().forEach((t) => t.stop());
            displayStream = null;
            // 页面勾选≠浏览器弹窗勾选；无音频轨时仅提示，不阻断麦克风录音
            setLocalError(
              "浏览器未给出会议音频轨（本次只录麦克风）。Mac 请选「Chrome 标签页」并勾选「分享音频」，不要只选窗口/整屏；会议建议用网页版打开再共享该标签页。",
            );
          } else {
            displayStreamRef.current = displayStream;
            displayStream.getAudioTracks().forEach((t) => {
              t.onended = () => {
                if (!stoppedRef.current) {
                  setStatusLine("会议/系统声音共享已结束，仍继续录麦克风…");
                }
              };
            });
          }
        } catch {
          setLocalError(
            "已取消屏幕共享（本次只录麦克风）。要录会议声请重新开录，选会议标签页并勾选「分享音频」。",
          );
        }
      }

      // Route Handler，避免 Server Action 哈希失效
      const markRes = await fetch(`/api/partner-reviews/${meetingId}/recording/start`, {
        method: "POST",
      });
      const mark = (await markRes.json()) as { ok?: boolean; error?: string; startedAt?: string };
      if (!markRes.ok || mark.error) {
        micStream.getTracks().forEach((t) => t.stop());
        displayStream?.getTracks().forEach((t) => t.stop());
        const msg = mark.error || `开录失败 HTTP ${markRes.status}`;
        setLocalError(msg);
        setPhase("error");
        setStatusLine("开录失败");
        onFlash(undefined, msg);
        return;
      }
      startedAtRef.current = mark.startedAt ?? new Date().toISOString();
      onMeetingLive();

      // 会议标签页音频往往偏小，略抬增益
      startPcmCapture([
        { stream: micStream, gain: 1.15 },
        ...(displayStream ? [{ stream: displayStream, gain: 1.85 }] : []),
      ]);

      const mixed = Boolean(displayStream?.getAudioTracks().length);
      setPhase("recording");
      setStatusLine(
        realtimeEnabled
          ? mixed
            ? `录音中（麦克风+会议声）· 每 ${chunkSec}s 识别一段`
            : `录音中 · 每 ${chunkSec}s 识别一段（首次可能较慢）`
          : mixed
            ? "录音中（麦克风+会议声）· 结束后再转写"
            : "录音中 · 结束后再转写",
      );
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);

      if (realtimeEnabled) {
        scheduleLiveLoop(chunkSec * 1000 + 300);
      }

      onFlash(
        mixed
          ? "已同时录麦克风与会议/标签页声音。左侧讨论谁点谁。"
          : "录音已开始。请对着麦克风说话；左侧讨论谁点谁。",
      );
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
    setLocalError(null);
    setStatusLine("正在停止并上传整段 WAV…");
    stoppedRef.current = true;
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
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
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
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
        `录音已保存 ${Math.round((data.bytes ?? blob.size) / 1024)} KB · 实时 ${chunkCount} 段已写入记录本`,
      );
      onFlash("录音已上传。记录本里的文字可直接用于「AI 拆分」。");
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

  const hasAudio =
    !!recordingBytes || transcriptStatus === "uploaded" || transcriptStatus === "ready";
  // 上传中忽略过期的实时错误，避免黄条里叠大红块
  const errText =
    phase === "uploading" ? null : localError || (phase === "error" ? transcriptError : null);
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
              请保持本页打开；讨论到谁就点左侧谁。识别文字会写入右侧记录本（约每 {chunkSec}{" "}
              秒一段）。
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!recording && phase !== "uploading" && phase !== "mic" ? (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 mr-1 max-w-[14rem] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={captureSystemAudio}
                  disabled={busy || disabled}
                  onChange={(e) => setCaptureSystemAudio(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>同时录会议/电脑声音</span>
              </label>
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => void start()}
                className="rounded-lg bg-rose-700 text-white px-3.5 py-2 text-sm font-medium hover:bg-rose-800 disabled:opacity-40"
              >
                {hasAudio ? "重新录音" : "开始近实时录音"}
              </button>
            </>
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
        </div>
      </div>

      {recording ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>输入电平</span>
            <span>
              {quietHint ? "持续偏静 — 请确认麦克风/会议音频已开启" : `音量 ${levelPct}%`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/80 border border-rose-100 overflow-hidden">
            <div
              className={`h-full transition-[width] duration-100 ${
                quietHint ? "bg-amber-400" : "bg-rose-500"
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

      {!recording && phase === "idle" ? (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          默认勾选「同时录会议/电脑声音」。开录后请在弹窗里选会议所在的{" "}
          <span className="text-slate-600">Chrome 标签页</span>
          （不要选窗口/整屏），并勾选「分享音频」。Mac 无法直接录系统声；腾讯会议/Zoom 建议开网页版再共享该标签页。
        </p>
      ) : null}
    </div>
  );
}
