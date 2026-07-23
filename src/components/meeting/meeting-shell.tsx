"use client";

import type { ReactNode } from "react";
import { MeetingToolbar } from "./meeting-toolbar";
import type { MeetingPhase } from "./types";

type Props = {
  phase: MeetingPhase;
  status: string;
  busy?: boolean;
  hasPrep?: boolean;
  currentDiscussTitle?: string | null;
  previewToken: string | null;
  resolvePreviewPath: () => Promise<string | null>;
  onPrep: () => void;
  onStart: () => void;
  onEnd: () => void;
  onResetToPrep?: () => void;
  toolbarExtra?: ReactNode;
  shareMode?: "prep-only" | "prep-and-later" | "none";
  flashOk?: string | null;
  flashError?: string | null;
  recordingSlot?: ReactNode;
  postSlot?: ReactNode;
  children: ReactNode;
};

/**
 * 开会场景壳：顶栏 → 提示 → 录音 → 会后 → 主内容。
 * 领域差异放在 children / postSlot / recordingSlot。
 */
export function MeetingShell({
  phase,
  status,
  busy,
  hasPrep,
  currentDiscussTitle,
  previewToken,
  resolvePreviewPath,
  onPrep,
  onStart,
  onEnd,
  onResetToPrep,
  toolbarExtra,
  shareMode,
  flashOk,
  flashError,
  recordingSlot,
  postSlot,
  children,
}: Props) {
  return (
    <div className="space-y-4">
      <MeetingToolbar
        phase={phase}
        status={status}
        busy={busy}
        hasPrep={hasPrep}
        currentDiscussTitle={currentDiscussTitle}
        previewToken={previewToken}
        resolvePreviewPath={resolvePreviewPath}
        onPrep={onPrep}
        onStart={onStart}
        onEnd={onEnd}
        onResetToPrep={onResetToPrep}
        extra={toolbarExtra}
        shareMode={shareMode}
      />
      {flashError || flashOk ? (
        <div
          className={`sticky top-0 z-30 rounded-lg border px-3 py-2 text-sm shadow-sm ${
            flashError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {flashError || flashOk}
        </div>
      ) : null}
      {recordingSlot}
      {postSlot}
      {children}
    </div>
  );
}
