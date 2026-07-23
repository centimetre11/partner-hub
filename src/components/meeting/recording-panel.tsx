"use client";

import type { ReactNode } from "react";
import { MeetingBatchRecorder } from "./meeting-batch-recorder";
import { useMessages } from "@/lib/i18n/context";
import type { MeetingPhase } from "./types";

type Props = {
  phase: MeetingPhase;
  meetingId: string;
  apiBase: string;
  transcriptStatus: string | null;
  transcriptError: string | null;
  onFlash: (ok?: string, err?: string) => void;
  onRecordingStarted: (startedAt?: string) => void;
  onTranscribed: (payload: {
    plain: string;
    liveNotes: string | null;
    matchMethod?: string;
  }) => void;
};

/** LIVE 阶段主录音区（与过伙伴一致：仅开会中显示） */
export function MeetingLiveRecording({
  phase,
  meetingId,
  apiBase,
  transcriptStatus,
  transcriptError,
  onFlash,
  onRecordingStarted,
  onTranscribed,
}: Props) {
  if (phase !== "live") return null;
  return (
    <MeetingBatchRecorder
      meetingId={meetingId}
      apiBase={apiBase}
      transcriptStatus={transcriptStatus}
      transcriptError={transcriptError}
      onFlash={onFlash}
      onRecordingStarted={onRecordingStarted}
      onTranscribed={onTranscribed}
    />
  );
}

export function MeetingPathBPanel({
  children,
  title,
  hint,
}: {
  children: ReactNode;
  title?: string;
  hint?: string;
}) {
  const t = useMessages().meetingUi;
  return (
    <>
      <div className="text-sm font-semibold text-slate-900">{title ?? t.pathBTitle}</div>
      <p className="text-[11px] text-slate-600 leading-relaxed">{hint ?? t.pathBHint}</p>
      {children}
    </>
  );
}
