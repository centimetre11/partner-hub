"use client";

import { useEffect, useRef, useState } from "react";
import { meterLevel, sliceLastSeconds } from "@/lib/asr/wav";
import { XfyunRelayClient } from "@/lib/asr/xfyun-relay-client";

type Props = {
  meetingId: string;
  transcriptStatus: string | null;
  transcriptError: string | null;
  disabled?: boolean;
  onFlash: (ok?: string, err?: string) => void;
  onUploaded: () => void;
  onMeetingLive: () => void;
  /** 实时转写全文预览（含中间结果） */
  onLiveTranscript?: (plain: string) => void;
  onRecordingChange?: (recording: boolean) => void;
};

type Phase = "idle" | "mic" | "recording" | "stopping" | "error";

function formatTime(sec: number) {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function MeetingLocalRecorder({
  meetingId,
  transcriptStatus,
  transcriptError,
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
  const [sentenceCount, setSentenceCount] = useState(0);
  const [lastPreview, setLastPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);
  const [quietHint, setQuietHint] = useState(false);
  const [displayPlain, setDisplayPlain] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const levelTimerRef = useRef<number | null>(null);
  const quietStreakRef = useRef(0);
  const xfyunRef = useRef<XfyunRelayClient | null>(null);
  const interimRef = useRef("");
  const finalPlainRef = useRef("");

  const recording = phase === "recording";

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
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
      await xfyunRef.current?.close();
    } catch {
      /* ignore */
    }
    xfyunRef.current = null;
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
    interimRef.current = "";
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

  function pushDisplay() {
    const finalPlain = finalPlainRef.current;
    const interim = interimRef.current;
    const combined = interim
      ? `${finalPlain}${finalPlain && interim ? "\n" : ""}${interim}`
      : finalPlain;
    setDisplayPlain(combined);
    onLiveTranscript?.(combined);
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
      const copy = new Float32Array(input);
      pcmChunksRef.current.push(copy);
      xfyunRef.current?.pushFloat32(copy, sampleRateRef.current);
      const maxSamples = sampleRateRef.current * 60 * 30;
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
      if (m < 0.04) {
        quietStreakRef.current += 1;
        if (quietStreakRef.current >= 20) setQuietHint(true);
      } else {
        quietStreakRef.current = 0;
        setQuietHint(false);
      }
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
        : "正在连接讯飞实时转写…",
    );
    stoppedRef.current = false;
    setSentenceCount(0);
    setLastPreview(null);
    setElapsedSec(0);
    setDisplayPlain("");
    interimRef.current = "";
    finalPlainRef.current = "";

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
      if (!markRes.ok) {
        const markErr = (await markRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(markErr.error || `开录失败 HTTP ${markRes.status}`);
      }
      const mark = (await markRes.json()) as { ok?: boolean; error?: string };
      if (mark.error) throw new Error(mark.error);
      onMeetingLive();

      setStatusLine("正在连接讯飞实时转写（经服务器）…");
      const sessRes = await fetch(`/api/partner-reviews/${meetingId}/recording/xfyun-session`, {
        method: "POST",
      });
      if (!sessRes.ok) {
        const sessErr = (await sessRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(sessErr.error || `讯飞会话失败 HTTP ${sessRes.status}`);
      }
      const sess = (await sessRes.json()) as {
        ok?: boolean;
        error?: string;
        relaySessionId?: string;
        sampleRate?: number;
        frameBytes?: number;
        frameIntervalMs?: number;
      };
      if (!sess.relaySessionId) {
        throw new Error(sess.error || "讯飞转写未配置或鉴权失败");
      }

      const client = new XfyunRelayClient(
        meetingId,
        {
          relaySessionId: sess.relaySessionId,
          sampleRate: sess.sampleRate ?? 16000,
          frameBytes: sess.frameBytes ?? 1280,
          frameIntervalMs: sess.frameIntervalMs ?? 40,
        },
        (result) => {
          if (stoppedRef.current) return;
          if (result.error) {
            setLocalError(result.error);
            setStatusLine(`讯飞异常：${result.error.slice(0, 60)}`);
            return;
          }
          if (result.plain) finalPlainRef.current = result.plain;
          if (result.isFinal && result.text) {
            interimRef.current = "";
            setSentenceCount((n) => n + 1);
            setLastPreview(result.text.slice(0, 120));
            pushDisplay();
            setStatusLine(`已识别：${result.text.slice(0, 36)}${result.text.length > 36 ? "…" : ""}`);
          } else if (result.text) {
            interimRef.current = result.text;
            pushDisplay();
          }
        },
        (err) => {
          if (!stoppedRef.current) setLocalError(err);
        },
      );
      xfyunRef.current = client;
      await client.connect();

      // 先开麦克风采集，避免等「共享屏幕」弹窗期间完全无音频
      startPcmCapture([{ stream: micStream, gain: 1.15 }]);
      setPhase("recording");
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
      setStatusLine("讯飞实时转写中 · 文字将写入右侧记录本");

      let displayStream: MediaStream | null = null;
      if (captureSystemAudio) {
        setStatusLine("转写已开始 · 可选：共享会议标签页并勾选「分享音频」…");
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            preferCurrentTab: false,
            systemAudio: "include",
          } as DisplayMediaStreamOptions);
          displayStream.getVideoTracks().forEach((t) => t.stop());
          if (displayStream.getAudioTracks().length === 0) {
            displayStream.getTracks().forEach((t) => t.stop());
            displayStream = null;
            setLocalError(
              "浏览器未给出会议音频轨（本次只录麦克风）。Mac 请选「Chrome 标签页」并勾选「分享音频」。",
            );
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
          ? "讯飞实时转写中（麦克风 + 会议声）"
          : "讯飞实时转写中 · 文字将写入右侧记录本",
      );

      onFlash(
        mixed
          ? "已开始录音与实时转写。讨论谁点左侧谁。"
          : "已开始录音与实时转写。请对着麦克风说话；讨论谁点左侧谁。",
      );
    } catch (e) {
      const msg =
        e instanceof TypeError && /fetch/i.test(String(e.message))
          ? "网络请求失败（Failed to fetch），请刷新页面后重试"
          : e instanceof Error
            ? e.message
            : "无法开始录音";
      setLocalError(msg);
      setPhase("error");
      setStatusLine("开录失败");
      onFlash(undefined, msg);
      await teardown();
    } finally {
      setBusy(false);
    }
  }

  async function stopRecording() {
    if (!streamRef.current && !audioCtxRef.current) return;
    setBusy(true);
    setPhase("stopping");
    setLocalError(null);
    setStatusLine("正在上传剩余音频…");

    try {
      // 先停采集，再 flush 讯飞（避免 stoppedRef 阻断 UI 更新）
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
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;

      setStatusLine("正在结束讯飞转写…");
      await Promise.race([
        xfyunRef.current?.close(),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
      xfyunRef.current = null;
      stoppedRef.current = true;
      pcmChunksRef.current = [];
      interimRef.current = "";

      setStatusLine("正在生成记录本…");
      const finRes = await fetch(`/api/partner-reviews/${meetingId}/recording/finalize`, {
        method: "POST",
      });
      const fin = (await finRes.json()) as { ok?: boolean; error?: string; liveNotes?: string | null };
      if (!finRes.ok) throw new Error(fin.error || finRes.statusText);

      if (fin.liveNotes) {
        finalPlainRef.current = fin.liveNotes;
        setDisplayPlain(fin.liveNotes);
        onLiveTranscript?.(fin.liveNotes);
      }

      setPhase("idle");
      setLevel(0);
      setStatusLine(
        sentenceCount > 0
          ? `转写完成 · 共 ${sentenceCount} 句，记录本已按伙伴段落生成`
          : "录音已结束（未识别到有效语音）",
      );
      onFlash(sentenceCount > 0 ? "实时转写已完成，可直接 AI 拆分。" : "录音已结束。");
      onUploaded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "结束失败";
      setLocalError(msg);
      setPhase("error");
      setStatusLine("结束失败");
      onFlash(undefined, msg);
    } finally {
      setBusy(false);
    }
  }

  const errText =
    phase === "stopping" ? null : localError || (phase === "error" ? transcriptError : null);
  const levelPct = Math.round(level * 100);

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-3 ${
        recording
          ? "border-rose-300 bg-rose-50/90 shadow-sm"
          : phase === "error"
            ? "border-red-200 bg-red-50/70"
            : phase === "stopping"
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
                ? "讯飞实时转写"
                : phase === "stopping"
                  ? "正在结束"
                  : phase === "mic"
                    ? "准备中"
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
              请保持本页打开；讨论到谁就点左侧谁。文字实时写入右侧记录本。
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!recording && phase !== "stopping" && phase !== "mic" ? (
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
                {transcriptStatus === "ready" || transcriptStatus === "recording"
                  ? "重新开始录音"
                  : "开始录音与转写"}
              </button>
            </>
          ) : null}
          {recording ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void stopRecording()}
              className="rounded-lg bg-slate-900 text-white px-3.5 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
            >
              停止录音
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
          <div className="text-[11px] text-slate-500">已识别 {sentenceCount} 句</div>
          {lastPreview ? (
            <p className="text-xs text-violet-900 bg-white/70 border border-violet-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
              最新：{lastPreview}
            </p>
          ) : null}
        </div>
      ) : null}

      {displayPlain && phase === "idle" ? (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
          {displayPlain.slice(0, 400)}
          {displayPlain.length > 400 ? "…" : ""}
        </p>
      ) : null}

      {errText ? (
        <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {errText}
        </div>
      ) : null}

      {!recording && phase === "idle" ? (
        <p className="text-[11px] text-slate-400 leading-relaxed">
          使用科大讯飞实时转写。提高准确率：① 远程会议请共享 Chrome 标签页并勾选「分享音频」；②
          在讯飞控制台上传本场伙伴名/公司名为热词；③ 开始讨论某伙伴时再点左侧打标。Mac
          纯麦克风识别率会低于共享会议声。
        </p>
      ) : null}
    </div>
  );
}
