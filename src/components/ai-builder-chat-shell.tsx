"use client";

import type { ReactNode } from "react";

/** Fixed-height builder chat: scroll messages, pin delivery bar + input in viewport. */
export function AiBuilderChatShell({
  title,
  desc,
  initPanel,
  children,
  footer,
  preview,
}: {
  title: string;
  desc: string;
  initPanel?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  preview: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-stretch h-[calc(100dvh-14rem)] min-h-[480px] max-h-[920px]">
      <div className="xl:col-span-3 bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col min-h-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-3">
          {initPanel}
          {children}
        </div>
        <div className="border-t border-slate-100 p-3 flex flex-col gap-2 shrink-0 bg-white">{footer}</div>
      </div>
      <div className="xl:col-span-2 min-h-0 overflow-y-auto space-y-4">{preview}</div>
    </div>
  );
}

export function BuilderInitPanel({
  title,
  desc,
  starters,
  tryLabel,
  onPick,
  disabled,
}: {
  title: string;
  desc: string;
  tryLabel: string;
  starters: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4 mb-2">
      <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{desc}</p>
      </div>
      <div className="space-y-2">
        <div className="text-xs text-slate-400">{tryLabel}</div>
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:border-slate-300 hover:text-sky-700 disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
