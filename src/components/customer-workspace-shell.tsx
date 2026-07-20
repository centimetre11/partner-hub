"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export type CustomerTab = {
  id: string;
  label: string;
  desc?: string;
  badge?: string | null;
  content: ReactNode;
};

export function CustomerWorkspaceShell({ tabs }: { tabs: CustomerTab[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const active =
    tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : (tabs[0]?.id ?? "");
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  function selectTab(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id === tabs[0]?.id) params.delete("tab");
    else params.set("tab", id);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-12 sm:pb-16">
      <div className={`grid grid-cols-2 gap-2 mb-5 ${tabs.length >= 7 ? "sm:grid-cols-3 lg:grid-cols-7" : tabs.length >= 6 ? "sm:grid-cols-3 lg:grid-cols-6" : tabs.length >= 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-4 lg:grid-cols-4"}`}>
        {tabs.map((t) => {
          const isActive = activeTab?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`rounded-lg border px-4 py-3 text-left ${
                isActive
                  ? "border-slate-700 bg-slate-900 text-white"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${isActive ? "text-white" : "text-slate-900"}`}>{t.label}</span>
                {t.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </div>
              {t.desc && (
                <p className={`text-[11px] mt-1 line-clamp-1 ${isActive ? "text-slate-400" : "text-slate-400"}`}>{t.desc}</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-base font-semibold text-slate-900">{activeTab?.label}</h2>
          {activeTab?.desc && <p className="text-sm text-slate-500 mt-0.5">{activeTab.desc}</p>}
        </div>
        <div className="p-4 sm:p-6">{activeTab?.content}</div>
      </div>
    </div>
  );
}
