"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/ai", label: "Overview", icon: "✦", exact: true },
  { href: "/agents", label: "Agent", icon: "❖" },
  { href: "/tools", label: "Tools", icon: "🔧" },
  { href: "/skills", label: "Skills", icon: "⚡" },
  { href: "/knowledge", label: "Knowledge", icon: "📚" },
];

export function AiCenterNav() {
  const pathname = usePathname();

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4">
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex flex-nowrap sm:flex-wrap gap-1 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-1 max-w-3xl min-w-max sm:min-w-0">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-white text-indigo-700 shadow-sm border border-zinc-200/60"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-white/60"
                }`}
              >
                <span className="text-base leading-none">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
