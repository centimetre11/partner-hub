"use client";

import type { ReactNode } from "react";
import { useMessages } from "@/lib/i18n/context";
import type { MeetingAgendaItemBase, MeetingPhase } from "./types";

type Props<T extends MeetingAgendaItemBase> = {
  phase: MeetingPhase;
  items: T[];
  activeId: string | null;
  currentDiscussId: string | null;
  markJustAt?: number;
  onSelect: (item: T) => void;
  /** LIVE 时选中即打点 */
  onDiscuss?: (item: T) => void;
  renderBadges?: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  footer?: ReactNode;
  title?: string;
};

export function MeetingAgendaPanel<T extends MeetingAgendaItemBase>({
  phase,
  items,
  activeId,
  currentDiscussId,
  markJustAt = 0,
  onSelect,
  onDiscuss,
  renderBadges,
  renderMeta,
  footer,
  title,
}: Props<T>) {
  const t = useMessages().meetingUi;
  const isLive = phase === "live";

  return (
    <aside className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500">
        {title ?? t.agenda}
        {isLive ? <span className="font-normal text-slate-400">{t.agendaHint}</span> : null}
      </div>
      <ul className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
        {items.map((item, idx) => {
          const isDiscussing = currentDiscussId === item.id && isLive;
          const justMarked =
            isDiscussing && markJustAt > 0 && Date.now() - markJustAt < 2500;
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  if (isLive && onDiscuss) onDiscuss(item);
                }}
                className={`w-full text-left py-2.5 pr-3 text-sm transition-colors ${
                  isDiscussing
                    ? "pl-2 border-l-4 border-emerald-500 bg-emerald-50/90 hover:bg-emerald-50"
                    : active
                      ? "pl-3 bg-sky-50/80 hover:bg-sky-50"
                      : "pl-3 hover:bg-slate-50"
                } ${justMarked ? "ring-2 ring-emerald-400 ring-inset" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-4 shrink-0">{idx + 1}</span>
                  <span className="font-medium text-slate-800 truncate min-w-0 flex-1">
                    {item.title}
                  </span>
                  {isDiscussing ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t.discussing}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 pl-6 flex flex-wrap items-center gap-1.5">
                  {renderBadges?.(item)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 pl-6">
                  {item.status === "CONFIRMED"
                    ? t.confirmed
                    : item.status === "DISCUSSED"
                      ? isDiscussing
                        ? t.nowDiscussing
                        : t.discussed
                      : isLive
                        ? t.pendingDiscuss
                        : t.pending}
                  {renderMeta?.(item)}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {footer}
    </aside>
  );
}
