"use client";

import Link from "next/link";
import { useMessages } from "@/lib/i18n/context";

export function BuilderModeToggleClient({
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
  const activeCls = "bg-slate-900 text-white";
  const idleCls = "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";

  return (
    <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50/80">
      <Link href={manualHref} className={`${base} ${active === "manual" ? activeCls : idleCls}`}>
        {b.modeManual}
      </Link>
      <Link href={autoHref} className={`${base} ${active === "auto" ? activeCls : idleCls}`}>
        {b.modeAuto}
      </Link>
    </div>
  );
}
