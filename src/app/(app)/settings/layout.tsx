"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";

const navItems = [
  { href: "/settings/team", label: "团队" },
  { href: "/settings/ai", label: "AI 配置" },
  { href: "/settings/logs", label: "活动日志" },
  { href: "/settings/knowledge", label: "知识库" },
  { href: "/settings/integrations", label: "集成" },
  { href: "/settings/analytics", label: "行为分析" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const m = useMessages();
  const pathname = usePathname();

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">{m.settings.title}</h1>
          <p className="text-sm text-slate-500">{m.settings.desc}</p>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <nav className="shrink-0 lg:w-44 xl:w-48">
            <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <div className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible pb-0.5 lg:pb-0">
                {navItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`shrink-0 w-full text-left rounded-lg px-3 py-2 text-sm transition-colors whitespace-nowrap lg:whitespace-normal ${
                        active
                          ? "bg-slate-900 text-white font-medium"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
