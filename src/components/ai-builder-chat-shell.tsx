"use client";

import type { ReactNode } from "react";

/** Fixed-height builder chat: scroll messages, pin input in viewport. */
export function AiBuilderChatShell({
  title,
  desc,
  initPanel,
  children,
  footer,
  preview,
  className = "",
}: {
  title?: string;
  desc?: string;
  initPanel?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  preview: ReactNode;
  className?: string;
}) {
  const showHeader = !!(title || desc);
  return (
    <div
      className={`grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch h-full min-h-[480px] ${className}`}
    >
      <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 flex flex-col min-h-0 overflow-hidden">
        {showHeader ? (
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            {title ? <div className="text-sm font-semibold text-slate-900">{title}</div> : null}
            {desc ? <div className="text-xs text-slate-400 mt-0.5">{desc}</div> : null}
          </div>
        ) : null}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
          {initPanel}
          {children}
        </div>
        <div className="border-t border-slate-100 p-3 flex flex-col gap-2 shrink-0 bg-white">{footer}</div>
      </div>
      <div className="lg:col-span-5 min-h-0 overflow-y-auto space-y-4">{preview}</div>
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
