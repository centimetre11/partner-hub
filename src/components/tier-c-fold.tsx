"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  count: number;
  storageKey: string;
  forceOpen?: boolean;
  label: string;
  hint?: string;
  children: ReactNode;
};

/**
 * 看板列底：默认收纳 Tier C / 未分级；偏好写入 localStorage。
 * forceOpen（如 ?tier=C）时始终展开。
 */
export function TierCFold({ count, storageKey, forceOpen = false, label, hint, children }: Props) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setReady(true);
      return;
    }
    try {
      setOpen(localStorage.getItem(storageKey) === "1");
    } catch {
      setOpen(false);
    }
    setReady(true);
  }, [forceOpen, storageKey]);

  if (count <= 0) return null;

  const resolvedOpen = forceOpen || open;

  return (
    <div className="rounded-lg border border-dashed border-slate-200/90 bg-white/50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-slate-50/80 transition-colors"
        aria-expanded={resolvedOpen}
        disabled={forceOpen}
        onClick={() => {
          if (forceOpen) return;
          const next = !open;
          setOpen(next);
          try {
            localStorage.setItem(storageKey, next ? "1" : "0");
          } catch {
            /* ignore */
          }
        }}
      >
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-600 truncate">{label}</div>
          {hint ? <div className="text-[10px] text-slate-400 truncate mt-0.5">{hint}</div> : null}
        </div>
        <span
          aria-hidden
          className={`text-slate-400 text-[10px] shrink-0 transition-transform ${
            ready && resolvedOpen ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>
      {resolvedOpen ? (
        <div className="px-1.5 pb-2 pt-0.5 space-y-2 border-t border-slate-100/80">{children}</div>
      ) : null}
    </div>
  );
}

/** Tier A/B 进主列表；C 与未分级进折叠区 */
export function splitByTierFocus<T>(
  items: T[],
  getTier: (item: T) => string | null | undefined,
): { primary: T[]; folded: T[] } {
  const primary: T[] = [];
  const folded: T[] = [];
  for (const item of items) {
    const t = String(getTier(item) ?? "")
      .trim()
      .toUpperCase();
    if (t === "A" || t === "B") primary.push(item);
    else folded.push(item);
  }
  return { primary, folded };
}
