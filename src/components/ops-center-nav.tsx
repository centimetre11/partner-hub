"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";

const tabs = [
  { href: "/ops", label: "Overview", labelZh: "总览", icon: "◎", exact: true },
  { href: "/partner-reviews", label: "Partner reviews", labelZh: "过伙伴会议", icon: "◫" },
  { href: "/segments", label: "Segment insights", labelZh: "客群洞察", icon: "◍" },
  { href: "/documents", label: "Reports", labelZh: "报告中心", icon: "📋" },
  { href: "/ops/weekly-report", label: "Report history", labelZh: "历史周报", icon: "▤" },
];

export function OpsCenterNav() {
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4">
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex flex-nowrap sm:flex-wrap gap-1 rounded-lg border border-slate-200/80 bg-slate-50/80 p-1 max-w-3xl min-w-max sm:min-w-0">
          {tabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  active
                    ? "bg-white text-sky-700 shadow-sm border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/60"
                }`}
              >
                <span className="text-base leading-none">{tab.icon}</span>
                {locale === "zh" ? tab.labelZh : tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
