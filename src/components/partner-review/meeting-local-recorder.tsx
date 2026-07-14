"use client";

import { useEffect, useRef, useState } from "react";
import {
  markLocalRecordingStartedAction,
  runLocalAsrAction,
} from "@/lib/partner-review/actions";

type Props = {
  meetingId: string;
  transcriptStatus: string | null;
  recordingBytes: number | null;
  transcriptError: string | null;
  /** 团队设置：近实时 */
  realtimeEnabled?: boolean;
  chunkSeconds?: number;
  disabled?: boolean;
  onFlash: (ok?: string, err?: string) => void;
  onUploaded: () => void;
  onMeetingLive: () => void;
  onLiveTranscript?: (plain: string) => void;
};

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
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
}: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [liveHint, setLiveHint] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const allSegmentsRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef("");
  const offsetMsRef = useRef(0);
  const segmentStartedAtRef = useRef(0);
  const liveBusyRef = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function startRecorderOnStream(stream: MediaStream) {
    const mime = mimeRef.current;
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    mediaRef.current = recorder;
    segmentStartedAtRef.current = Date.now();
    recorder.start(1000);
  }

  async function flushSegmentForLive(finalizing: boolean) {
    const recorder = mediaRef.current;
    const stream = streamRef.current;
    if (!recorder || !stream || recorder.state === "inactive") return null;

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("分片录音失败"));
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeRef.current || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      try {
        recorder.stop();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    const durationMs = Math.max(500, Date.now() - segmentStartedAtRef.current);
    const offsetMs = offsetMsRef.current;
    offsetMsRef.current += durationMs;

    if (blob.size > 800) {
      allSegmentsRef.current.push(blob);
    }

    if (!finalizing && !stoppedRef.current && streamRef.current) {
      startRecorderOnStream(streamRef.current);
      scheduleNextSegment();
    } else {
      mediaRef.current = null;
    }

    if (realtimeEnabled && blob.size > 800 && !liveBusyRef.current) {
      liveBusyRef.current = true;
      setLiveHint("实时转写中…");
      try {
        const form = new FormData();
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        form.append("file", blob, `chunk-${offsetMs}.${ext}`);
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
        };
        if (res.ok && data.plain != null) {
          onLiveTranscript?.(data.plain);
          setLiveHint(data.chunkText ? `实时：${data.chunkText.slice(0, 48)}${data.chunkText.length > 48 ? "…" : ""}` : "实时已更新");
        } else if (data.error) {
          setLiveHint(`实时失败：${data.error.slice(0, 40)}`);
        }
      } catch {
        setLiveHint("实时转写网络异常，录音仍继续");
      } finally {
        liveBusyRef.current = false;
      }
    }

    return blob;
  }

  function scheduleNextSegment() {
    if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current);
    const sec = Math.min(30, Math.max(8, chunkSeconds || 12));
    segmentTimerRef.current = window.setTimeout(() => {
      if (stoppedRef.current || !mediaRef.current) return;
      void flushSegmentForLive(false);
    }, sec * 1000);
  }

  async function start() {
    if (busy || recording || disabled) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onFlash(undefined, "当前环境不支持麦克风录音，请换 Chrome / Edge");
      return;
    }
    setBusy(true);
    stoppedRef.current = false;
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
      allSegmentsRef.current = [];
      offsetMsRef.current = 0;

      const mark = await markLocalRecordingStartedAction(meetingId);
      if (mark.error) {
        stream.getTracks().forEach((t) => t.stop());
        onFlash(undefined, mark.error);
        return;
      }
      startedAtRef.current = mark.startedAt ?? new Date().toISOString();
      onMeetingLive();

      startRecorderOnStream(stream);
      setRecording(true);
      setElapsedSec(0);
      setLiveHint(realtimeEnabled ? `近实时已开 · 每 ${chunkSeconds}s 出一截字` : "仅录音，结束后再转写");
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
      if (realtimeEnabled) scheduleNextSegment();
      onFlash(
        realtimeEnabled
          ? "已开始近实时录音。讨论谁就点左侧谁。"
          : "已开始录音。讨论谁就点左侧谁。",
      );
    } catch (e) {
      onFlash(undefined, e instanceof Error ? e.message : "无法打开麦克风");
    } finally {
      setBusy(false);
    }
  }

  async function stopAndUpload() {
    if (!streamRef.current && !mediaRef.current) return;
    setBusy(true);
    stoppedRef.current = true;
    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      // 冲掉最后一段
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        await flushSegmentForLive(true);
      }

      const type = mimeRef.current || "audio/webm";
      const blob = new Blob(allSegmentsRef.current, { type });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRef.current = null;
      setRecording(false);

      if (blob.size < 1024) {
        onFlash(undefined, "录音过短，请重新录");
        return;
      }
      const form = new FormData();
      const ext = type.includes("mp4") ? "m4a" : "webm";
      form.append("file", blob, `meeting-${meetingId}.${ext}`);
      form.append("startedAt", startedAtRef.current || new Date().toISOString());
      form.append("endedAt", new Date().toISOString());

      const res = await fetch(`/api/partner-reviews/${meetingId}/recording`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; bytes?: number };
      if (!res.ok || data.error) {
        onFlash(undefined, data.error || "上传录音失败");
        return;
      }

      // 近实时已有转写时，可选再跑整段精修；否则提示点转写
      if (realtimeEnabled && (transcriptStatus === "recording" || liveHint)) {
        onFlash(`录音已上传（${Math.round((data.bytes ?? blob.size) / 1024)} KB）。可再点「精修转写」用整段+AI纠偏。`);
      } else {
        onFlash(`录音已上传（${Math.round((data.bytes ?? blob.size) / 1024)} KB），可点「转写录音」`);
      }
      onUploaded();
    } catch (e) {
      onFlash(undefined, e instanceof Error ? e.message : "上传失败");
      setRecording(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } finally {
      setBusy(false);
      setLiveHint(null);
    }
  }

  async function runAsr() {
    setBusy(true);
    try {
      const res = await runLocalAsrAction(meetingId);
      if (res.error) onFlash(undefined, res.error);
      else {
        onFlash(res.message);
        onUploaded();
      }
    } finally {
      setBusy(false);
    }
  }

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const hasAudio = !!recordingBytes || transcriptStatus === "uploaded" || transcriptStatus === "ready";
  const statusLabel = recording
    ? realtimeEnabled
      ? "近实时录音中"
      : "录音中"
    : transcriptStatus === "uploaded"
      ? "已上传待转写"
      : transcriptStatus === "transcribing"
        ? "转写中…"
        : transcriptStatus === "ready"
          ? "转写就绪"
          : transcriptStatus === "error"
            ? "转写失败"
            : hasAudio
              ? "有录音"
              : "未录音";

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void start()}
            className="rounded-lg bg-rose-700 text-white px-3 py-1.5 text-sm hover:bg-rose-800 disabled:opacity-40"
          >
            {hasAudio ? "重新录音" : realtimeEnabled ? "开始近实时录音" : "开始录音并开会"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void stopAndUpload()}
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
          >
            停止并上传 {mm}:{ss}
          </button>
        )}
        {hasAudio && !recording ? (
          <button
            type="button"
            disabled={busy || transcriptStatus === "transcribing"}
            onClick={() => void runAsr()}
            className="rounded-lg bg-violet-700 text-white px-3 py-1.5 text-sm hover:bg-violet-800 disabled:opacity-40"
          >
            {transcriptStatus === "transcribing"
              ? "转写中…"
              : realtimeEnabled
                ? "精修转写（整段）"
                : "转写录音"}
          </button>
        ) : null}
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
          {statusLabel}
          {recordingBytes ? ` · ${Math.round(recordingBytes / 1024)} KB` : ""}
        </span>
        {transcriptError ? (
          <span className="text-[11px] text-red-600 max-w-md truncate" title={transcriptError}>
            {transcriptError}
          </span>
        ) : null}
      </div>
      {liveHint ? <p className="text-[11px] text-violet-700 truncate max-w-xl">{liveHint}</p> : null}
    </div>
  );
}
