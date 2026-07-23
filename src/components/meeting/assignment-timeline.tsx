"use client";

import type { ReactNode } from "react";
import { useMessages } from "@/lib/i18n/context";
import type { MeetingAgendaItemBase, MeetingWorkStage } from "./types";

type Props<T extends MeetingAgendaItemBase> = {
  items: T[];
  matchDrafts: Record<string, string>;
  unassignedDraft: string;
  busy?: boolean;
  workStage: MeetingWorkStage;
  statusMessage?: string | null;
  statusIsError?: boolean;
  onChangeItem: (itemId: string, text: string) => void;
  onChangeUnassigned: (text: string) => void;
  onSave: () => void;
  onConfirm: () => void;
  /** 跳过提炼，直接结束会议（可选） */
  onFinishWithoutExtract?: () => void;
  /** 确认按钮文案；默认「确认归属并提炼」 */
  confirmLabel?: string;
  finishWithoutExtractLabel?: string;
  /** 每条标题旁额外信息 */
  renderItemMeta?: (item: T, idx: number) => ReactNode;
};

/**
 * 会后归属时间线（简化版：全文编辑）。
 * 伙伴场景的发言条上下移动可作为增强插在领域层。
 */
export function MeetingAssignmentTimeline<T extends MeetingAgendaItemBase>({
  items,
  matchDrafts,
  unassignedDraft,
  busy,
  workStage,
  statusMessage,
  statusIsError,
  onChangeItem,
  onChangeUnassigned,
  onSave,
  onConfirm,
  onFinishWithoutExtract,
  confirmLabel,
  finishWithoutExtractLabel,
  renderItemMeta,
}: Props<T>) {
  const t = useMessages().meetingUi;
  const extracting = !!busy && workStage === "extracting";

  return (
    <section
      id="assignment-timeline"
      className="rounded-xl border-2 border-amber-300 bg-amber-50/30 p-4 space-y-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t.assignTitle}</div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{t.assignHint}</p>
        </div>
        <span className="text-[11px] font-medium text-amber-900 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
          {t.requiredStep}
        </span>
      </div>

      {statusMessage ? (
        <p className={`text-xs ${statusIsError ? "text-red-600" : "text-emerald-700"}`}>
          {statusMessage}
        </p>
      ) : null}

      <div className="rounded-lg border border-amber-100 bg-white p-3 space-y-2">
        <p className="text-xs font-medium text-amber-900">{t.unassigned}</p>
        <textarea
          value={unassignedDraft}
          onChange={(e) => onChangeUnassigned(e.target.value)}
          rows={3}
          disabled={extracting}
          placeholder={t.unassignedPh}
          className="w-full rounded border border-amber-100 px-2 py-1.5 text-xs font-mono disabled:opacity-50"
        />
      </div>

      <ol className="space-y-3">
        {items.map((it, idx) => {
          const text = matchDrafts[it.id] ?? "";
          return (
            <li key={it.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-sky-500 text-[11px] font-semibold text-sky-800">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{it.title}</p>
                  <p className="text-[11px] text-slate-400">
                    {text.trim() ? "" : t.noContent}
                    {renderItemMeta?.(it, idx)}
                  </p>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => onChangeItem(it.id, e.target.value)}
                rows={4}
                disabled={extracting}
                placeholder={t.segmentPh}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs font-mono disabled:opacity-50"
              />
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          {t.saveOwnership}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
        >
          {confirmLabel ?? t.confirmExtract}
        </button>
        {onFinishWithoutExtract ? (
          <button
            type="button"
            disabled={busy}
            onClick={onFinishWithoutExtract}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {finishWithoutExtractLabel ?? t.finishWithoutExtract}
          </button>
        ) : null}
      </div>
      {onFinishWithoutExtract ? (
        <p className="text-[11px] text-slate-400">{t.finishWithoutExtractHint}</p>
      ) : null}
    </section>
  );
}
