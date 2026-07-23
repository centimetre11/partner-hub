"use client";

import type { ReactNode } from "react";
import { useMessages } from "@/lib/i18n/context";
import { MeetingShareActions } from "./share-actions";
import type { MeetingPhase } from "./types";

type Props = {
  phase: MeetingPhase;
  status: string;
  busy?: boolean;
  /** 是否已有简报 / 可刷新 */
  hasPrep?: boolean;
  /** 当前讨论标题（LIVE） */
  currentDiscussTitle?: string | null;
  previewToken: string | null;
  resolvePreviewPath: () => Promise<string | null>;
  onPrep: () => void;
  onStart: () => void;
  onEnd: () => void;
  onResetToPrep?: () => void;
  /** 额外插在按钮行右侧（如领域特有按钮） */
  extra?: ReactNode;
  /** prep-only：仅会前行内分享（过伙伴）；prep-and-later：会后也显示（过线索） */
  shareMode?: "prep-only" | "prep-and-later";
};

/**
 * 开会框架顶栏：准备 / 开始 / 结束 / 回到会前 / 分享。
 * 配色与顺序在过伙伴、过线索间保持一致。
 */
export function MeetingToolbar({
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
  extra,
  shareMode = "prep-and-later",
}: Props) {
  const t = useMessages().meetingUi;
  const canPrep = phase === "prep" || status === "DRAFT" || status === "PREP";
  const showLaterShare =
    shareMode === "prep-and-later" && (phase === "post" || phase === "done");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canPrep ? (
          <button
            type="button"
            disabled={busy}
            onClick={onPrep}
            className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
          >
            {hasPrep ? t.refreshBrief : t.prep}
          </button>
        ) : null}

        {phase === "prep" ? (
          <>
            <MeetingShareActions previewToken={previewToken} resolvePath={resolvePreviewPath} />
            <button
              type="button"
              disabled={busy}
              onClick={onStart}
              className="rounded-lg bg-rose-700 text-white px-3 py-1.5 text-sm hover:bg-rose-800 disabled:opacity-40"
            >
              {t.startMeeting}
            </button>
          </>
        ) : null}

        {phase === "live" ? (
          <>
            {currentDiscussTitle ? (
              <span className="rounded-lg bg-sky-50 text-sky-800 border border-sky-100 px-3 py-1.5 text-xs font-medium">
                {currentDiscussTitle}
              </span>
            ) : (
              <span className="rounded-lg bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1.5 text-xs">
                {t.noMarker}
              </span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onEnd}
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              {t.endMeeting}
            </button>
          </>
        ) : null}

        {phase === "post" && onResetToPrep ? (
          <button
            type="button"
            disabled={busy}
            onClick={onResetToPrep}
            className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-40"
          >
            {t.backToPrep}
          </button>
        ) : null}

        {extra}
      </div>

      {showLaterShare ? (
        <MeetingShareActions previewToken={previewToken} resolvePath={resolvePreviewPath} />
      ) : null}
    </div>
  );
}
