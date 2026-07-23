"use client";

import type { ReactNode } from "react";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";
import type { MeetingPostStep, MeetingWorkStage } from "./types";

type Props = {
  phase: "post" | "done";
  postStep: MeetingPostStep;
  transcript: string;
  liveNotes: string;
  busy?: boolean;
  workStage: MeetingWorkStage;
  onTranscriptChange: (v: string) => void;
  onMatch: () => void;
  onRematch?: () => void;
  /** 路径 B 侧内容（讯飞状态 / 录音器 / 匹配按钮） */
  pathB: ReactNode;
};

function workStageLabel(
  stage: MeetingWorkStage,
  t: ReturnType<typeof useMessages>["meetingUi"],
) {
  if (stage === "saving") return t.workSaving;
  if (stage === "matching") return t.workMatching;
  if (stage === "extracting") return t.workExtracting;
  if (stage === "done") return t.workDone;
  return "";
}

/**
 * 会后双路径：A 腾讯粘贴 + B 讯飞（插槽）。
 */
export function PostMinutesDualPath({
  phase,
  postStep,
  transcript,
  liveNotes,
  busy,
  workStage,
  onTranscriptChange,
  onMatch,
  onRematch,
  pathB,
}: Props) {
  const t = useMessages().meetingUi;
  const matching = !!busy && (workStage === "saving" || workStage === "matching");
  const collapsed = postStep === "assign";

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {phase === "done"
                ? t.pathAReadonly
                : collapsed
                  ? t.pathAMatched
                  : t.pathAPaste}
            </div>
            {phase === "post" && !collapsed ? (
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{t.pathAHint}</p>
            ) : null}
            {phase === "post" && collapsed ? (
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{t.pathAAssignHint}</p>
            ) : null}
          </div>
          {matching ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800">
              <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
              {workStageLabel(workStage, t)}
            </span>
          ) : postStep === "assign" ? (
            <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
              {t.postCurrentAssign}
            </span>
          ) : postStep === "extract" ? (
            <span className="text-xs font-medium text-emerald-700">{t.postExtractedRedo}</span>
          ) : null}
        </div>

        {phase === "post" ? (
          <>
            {!collapsed ? (
              <textarea
                value={transcript}
                onChange={(e) => onTranscriptChange(e.target.value)}
                rows={7}
                disabled={matching}
                placeholder={t.pathAPastePh}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono leading-relaxed disabled:opacity-60"
              />
            ) : (
              <details className="text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                  {formatMsg(t.pathAExpand, { n: transcript.length })}
                </summary>
                <textarea
                  value={transcript}
                  onChange={(e) => onTranscriptChange(e.target.value)}
                  rows={4}
                  disabled={matching}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono leading-relaxed disabled:opacity-60"
                />
              </details>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {postStep !== "assign" ? (
                <button
                  type="button"
                  disabled={busy || !transcript.trim()}
                  onClick={onMatch}
                  className="rounded-lg bg-sky-700 text-white px-4 py-2 text-sm font-medium hover:bg-sky-800 disabled:opacity-40"
                >
                  {matching
                    ? workStageLabel(workStage, t)
                    : postStep === "paste"
                      ? t.postMatch
                      : t.postRematch}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !transcript.trim()}
                  onClick={onMatch}
                  className="rounded-lg border border-sky-300 bg-white text-sky-800 px-3 py-1.5 text-xs hover:bg-sky-50 disabled:opacity-40"
                >
                  {matching ? workStageLabel(workStage, t) : t.postRunMatch}
                </button>
              )}
              {postStep === "extract" && onRematch ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRematch}
                  className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
                >
                  {t.postOpenTimeline}
                </button>
              ) : null}
              {postStep === "paste" && !matching ? (
                <span className="text-[11px] text-slate-500">{t.postNext}</span>
              ) : null}
            </div>
          </>
        ) : (
          <textarea
            value={liveNotes || transcript}
            readOnly
            rows={5}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-relaxed bg-white text-slate-700"
          />
        )}
      </section>

      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
        {pathB}
      </section>
    </div>
  );
}

export function MeetingPostStepIndicator({
  step,
  extractOptional = false,
}: {
  step: MeetingPostStep;
  /** 第三步提炼可跳过时展示「可选」 */
  extractOptional?: boolean;
}) {
  const t = useMessages().meetingUi;
  const steps = [
    ["paste", t.postStepPaste],
    ["assign", t.postStepAssign],
    [
      "extract",
      extractOptional ? `${t.postStepExtract} · ${t.optionalStep}` : t.postStepExtract,
    ],
  ] as const;
  const order = { paste: 0, assign: 1, extract: 2 } as const;
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      {steps.map(([key, label]) => {
        const active = order[step] === order[key];
        const done = order[step] > order[key];
        return (
          <span
            key={key}
            className={`rounded-full border px-2.5 py-1 ${
              active
                ? "border-violet-400 bg-violet-50 text-violet-900 font-medium"
                : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

export function MeetingMatchSourceSwitch({
  tencentReady,
  xfyunReady,
  matchSource,
  busy,
  onSwitch,
}: {
  tencentReady: boolean;
  xfyunReady: boolean;
  matchSource: string | null;
  busy?: boolean;
  onSwitch: (source: "tencent" | "xfyun") => void;
}) {
  const t = useMessages().meetingUi;
  if (!tencentReady && !xfyunReady) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px]">
      <span className="font-medium text-slate-700">{t.activeSource}</span>
      <button
        type="button"
        disabled={busy || !tencentReady}
        onClick={() => onSwitch("tencent")}
        className={`rounded-full border px-2.5 py-1 ${
          matchSource === "tencent"
            ? "border-sky-400 bg-sky-50 font-semibold text-sky-900"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        } disabled:opacity-40`}
      >
        {t.sourceTencent}
      </button>
      <button
        type="button"
        disabled={busy || !xfyunReady}
        onClick={() => onSwitch("xfyun")}
        className={`rounded-full border px-2.5 py-1 ${
          matchSource === "xfyun"
            ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-900"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        } disabled:opacity-40`}
      >
        {t.sourceXfyun}
      </button>
      <span className="text-slate-400">{t.sourceHint}</span>
    </div>
  );
}
