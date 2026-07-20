"use client";

import { useEffect, useRef, useState } from "react";
import {
  downsampleFloat32,
  encodeWavMono,
  meterLevel,
} from "@/lib/asr/wav";

type Props = {
  meetingId: string;
  transcriptStatus: string | null;
  transcriptError: string | null;
  disabled?: boolean;
  onFlash: (ok?: string, err?: string) => void;
  /** 开录成功：会议进入 LIVE，recordingStartedAt 已锚定 */
  onRecordingStarted: (startedAt?: string) => void;
  /** 上传+讯飞转写完成 */
  onTranscribed: (payload: {
    plain: string;
    liveNotes: string | null;
    matchMethod?: string;
  }) => void;
};

type Phase = "idle" | "mic" | "recording" | "uploading" | "transcribing" | "error";

function formatTime(sec: number) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * 会中一次性录音（不实时转写）→ 结束后上传 → 讯飞整段转写。
 * 开录时刻 = recordingStartedAt，与会中打点可对齐。
 */
export function MeetingBatchRecorder({
  meetingId,
  transcriptStatus,
  transcriptError,
  disabled,
  onFlash,
  onRecordingStarted,
  onTranscribed,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [statusLine, setStatusLine] = useState("未开始录音");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const startedAtIsoRef = useRef<string | null>(null);

  const recording = phase === "recording";

  useEffect(() => {
    return () => {
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function teardown() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
    timerRef.current = null;
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
    audioCtxRef.current = ctx;
    sampleRateRef.current = ctx.sampleRate;
    pcmChunksRef.current = [];
    const mix = ctx.createGain();
    mix.gain.value = 1;
    for (const src of sources) {
      const node = ctx.createMediaStreamSource(src.stream);
      const g = ctx.createGain();
      g.gain.value = src.gain;
      node.connect(g);
      g.connect(mix);
    }
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      pcmChunksRef.current.push(new Float32Array(input));
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    mix.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
    levelTimerRef.current = window.setInterval(() => {
      const flat = flattenPcm();
      if (!flat.length) {
        setLevel(0);
        return;
      }
      const tail = flat.slice(Math.max(0, flat.length - sampleRateRef.current));
      setLevel(meterLevel(tail));
    }, 200);
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

    setBusy(true);
    setPhase("mic");
    setLocalError(null);
    setElapsedSec(0);
    setStatusLine("正在请求麦克风…");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = micStream;

      const markRes = await fetch(`/api/partner-reviews/${meetingId}/recording/start`, {
        method: "POST",
      });
      const mark = (await markRes.json()) as { ok?: boolean; error?: string; startedAt?: string };
      if (!markRes.ok || mark.error) throw new Error(mark.error || `开录失败 HTTP ${markRes.status}`);
      startedAtIsoRef.current = mark.startedAt ?? new Date().toISOString();
      onRecordingStarted(mark.startedAt);

      startPcmCapture([{ stream: micStream, gain: 1.15 }]);
      setPhase("recording");
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);

      let displayStream: MediaStream | null = null;
      if (captureSystemAudio) {
        setStatusLine("录音中 · 可选：共享会议标签页并勾选「分享音频」…");
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            // @ts-expect-error chrome
            systemAudio: "include",
          });
          displayStream.getVideoTracks().forEach((t) => t.stop());
          if (!displayStream.getAudioTracks().length) {
            displayStream.getTracks().forEach((t) => t.stop());
            displayStream = null;
            setLocalError("未拿到会议音频轨（本次只录麦克风）。请选 Chrome 标签页并勾选分享音频。");
          } else {
            displayStreamRef.current = displayStream;
            try {
              processorRef.current?.disconnect();
            } catch {
              /* ignore */
            }
            void audioCtxRef.current?.close().catch(() => undefined);
            audioCtxRef.current = null;
            processorRef.current = null;
            startPcmCapture([
              { stream: micStream, gain: 1.15 },
              { stream: displayStream, gain: 1.85 },
            ]);
          }
        } catch {
          setLocalError("已取消屏幕共享（本次只录麦克风）。");
        }
      }

      const mixed = Boolean(displayStream?.getAudioTracks().length);
      setStatusLine(
        mixed
          ? "录音中（麦克风 + 会议声）· 不实时转写 · 讨论谁点左侧谁"
          : "录音中 · 不实时转写 · 讨论谁点左侧谁",
      );
      onFlash(
        mixed
          ? "已开始一次性录音。过伙伴时请打点；结束后再整段讯飞转写。"
          : "已开始一次性录音（麦克风）。过伙伴时请打点；结束后再整段讯飞转写。",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "无法开始录音";
      setLocalError(msg);
      setPhase("error");
      setStatusLine("开录失败");
      onFlash(undefined, msg);
      await teardown();
    } finally {
      setBusy(false);
    }
  }

  async function stopAndTranscribe() {
    if (!recording && phase !== "error") return;
    setBusy(true);
    setPhase("uploading");
    setStatusLine("正在打包上传录音…");
    setLocalError(null);

    try {
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
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
      timerRef.current = null;
      levelTimerRef.current = null;
      const rate = sampleRateRef.current;
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;

      const flat = flattenPcm();
      pcmChunksRef.current = [];
      if (flat.length < rate * 2) {
        throw new Error("录音太短，请至少录几秒有效声音");
      }
      const pcm16k = downsampleFloat32(flat, rate, 16000);
      const wav = encodeWavMono(pcm16k, 16000);
      const endedAt = new Date().toISOString();
      const form = new FormData();
      form.append("file", wav, `${meetingId}.wav`);
      if (startedAtIsoRef.current) form.append("startedAt", startedAtIsoRef.current);
      form.append("endedAt", endedAt);

      const upRes = await fetch(`/api/partner-reviews/${meetingId}/recording`, {
        method: "POST",
        body: form,
      });
      const up = (await upRes.json()) as { ok?: boolean; error?: string };
      if (!upRes.ok || up.error) throw new Error(up.error || `上传失败 HTTP ${upRes.status}`);

      setPhase("transcribing");
      setStatusLine("正在讯飞一次性转写（可能需要几分钟）…");
      onFlash("录音已上传，正在讯飞整段转写…");

      const txRes = await fetch(`/api/partner-reviews/${meetingId}/recording/xfyun-batch`, {
        method: "POST",
      });
      const tx = (await txRes.json()) as {
        ok?: boolean;
        error?: string;
        plain?: string;
        liveNotes?: string | null;
        matchMethod?: string;
        sentences?: number;
      };
      if (!txRes.ok || tx.error) throw new Error(tx.error || `转写失败 HTTP ${txRes.status}`);

      setPhase("idle");
      setLevel(0);
      setStatusLine(`讯飞转写完成 · ${tx.sentences ?? 0} 句 · 可与腾讯纪要对比校准`);
      onFlash(`讯飞转写完成（${tx.sentences ?? 0} 句）。腾讯粘贴路径仍保留，可两边对比。`);
      onTranscribed({
        plain: tx.plain ?? "",
        liveNotes: tx.liveNotes ?? null,
        matchMethod: tx.matchMethod,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "结束失败";
      setLocalError(msg);
      setPhase("error");
      setStatusLine("失败");
      onFlash(undefined, msg);
    } finally {
      setBusy(false);
    }
  }

  const errText = localError || (phase === "error" ? transcriptError : null);
  const levelPct = Math.round(level * 100);
  const readyHint =
    transcriptStatus === "ready"
      ? "已有讯飞转写"
      : transcriptStatus === "uploaded"
        ? "录音已上传，可点下方重试转写"
        : null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-3 ${
        recording
          ? "border-rose-300 bg-rose-50/90 shadow-sm"
          : phase === "error"
            ? "border-red-200 bg-red-50/70"
            : "border-emerald-200 bg-emerald-50/50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">路径 B · 讯飞一次性录音</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
            会中只录音 + 打点（不实时出字）；结束后整段讯飞转写。开录时刻与打点同钟，便于对齐。
            腾讯粘贴路径不受影响，可会后对比校准。
          </p>
        </div>
        {recording ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            REC {formatTime(elapsedSec)}
          </span>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-[11px] text-slate-600">
        <input
          type="checkbox"
          checked={captureSystemAudio}
          disabled={busy || recording}
          onChange={(e) => setCaptureSystemAudio(e.target.checked)}
        />
        同时采集会议标签页声音（推荐）
      </label>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/80 border border-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${levelPct}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-slate-500 w-10">{levelPct}%</span>
      </div>

      <p className="text-[11px] text-slate-600">{statusLine}</p>
      {readyHint ? <p className="text-[11px] text-emerald-800">{readyHint}</p> : null}
      {errText ? <p className="text-[11px] text-red-600">{errText}</p> : null}

      <div className="flex flex-wrap gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void start()}
            className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-800 disabled:opacity-40"
          >
            {phase === "mic" ? "准备中…" : "开始录音"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void stopAndTranscribe()}
            className="rounded-lg bg-rose-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-800 disabled:opacity-40"
          >
            结束并讯飞转写
          </button>
        )}
        {transcriptStatus === "uploaded" || transcriptStatus === "error" ? (
          <button
            type="button"
            disabled={busy || recording}
            onClick={() => {
              setBusy(true);
              setPhase("transcribing");
              setStatusLine("正在重试讯飞转写…");
              void fetch(`/api/partner-reviews/${meetingId}/recording/xfyun-batch`, {
                method: "POST",
              })
                .then(async (r) => {
                  const tx = (await r.json()) as {
                    ok?: boolean;
                    error?: string;
                    plain?: string;
                    liveNotes?: string | null;
                    matchMethod?: string;
                    sentences?: number;
                  };
                  if (!r.ok || tx.error) throw new Error(tx.error || r.statusText);
                  setPhase("idle");
                  setStatusLine(`讯飞转写完成 · ${tx.sentences ?? 0} 句`);
                  onFlash("讯飞转写完成");
                  onTranscribed({
                    plain: tx.plain ?? "",
                    liveNotes: tx.liveNotes ?? null,
                    matchMethod: tx.matchMethod,
                  });
                })
                .catch((e) => {
                  setPhase("error");
                  const msg = e instanceof Error ? e.message : String(e);
                  setLocalError(msg);
                  onFlash(undefined, msg);
                })
                .finally(() => setBusy(false));
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            重试讯飞转写
          </button>
        ) : null}
      </div>
    </div>
  );
}
