"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";

export function ArrViewSwitch() {
  const pathname = usePathname();
  const t = useMessages().arr;
  const onCalendar = pathname.startsWith("/arr/calendar");

  const base = "rounded-lg px-3 py-1.5 text-sm";
  const active = "bg-slate-900 text-white hover:bg-slate-800";
  const idle = "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <div className="flex items-center gap-2">
      <Link href="/arr/calendar" className={`${base} ${onCalendar ? active : idle}`}>
        {t.linkCalendar}
      </Link>
      <Link href="/arr" className={`${base} ${onCalendar ? idle : active}`}>
        {t.linkOverview}
      </Link>
    </div>
  );
}
