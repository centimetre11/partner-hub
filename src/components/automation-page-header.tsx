"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMessages } from "@/lib/i18n/context";

function BuilderModeToggle({
  active,
  autoHref,
  manualHref,
}: {
  active: "auto" | "manual";
  autoHref: string;
  manualHref: string;
}) {
  const b = useMessages().builderCommon;
  const base = "rounded-md px-3 py-1.5 text-xs font-medium transition-colors";
  const activeCls = "bg-slate-900 text-white shadow-sm";
  const idleCls = "text-slate-600 hover:text-slate-900";

  return (
    <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50/80 shrink-0">
      <Link href={manualHref} className={`${base} ${active === "manual" ? activeCls : idleCls}`}>
        {b.modeManual}
      </Link>
      <Link href={autoHref} className={`${base} ${active === "auto" ? activeCls : idleCls}`}>
        {b.modeAuto}
      </Link>
    </div>
  );
}

export function AutomationPageHeader({
  title,
  subtitle,
  builderMode,
  backHref = "/automations",
  actions,
}: {
  title: string;
  subtitle?: string;
  builderMode?: "manual" | "auto";
  backHref?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={backHref} className="text-slate-400 hover:text-slate-700 text-lg shrink-0 leading-none">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 truncate">{title}</h1>
            {subtitle ? (
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {builderMode ? (
            <BuilderModeToggle
              active={builderMode}
              autoHref="/automations/new/ai"
              manualHref="/automations/new"
            />
          ) : null}
          {actions}
        </div>
      </div>
    </div>
  );
}
