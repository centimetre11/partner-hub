"use client";

import type { ReactNode } from "react";

export type SettingsNavItem = { id: string; label: string };

export function SettingsShell({
  nav,
  children,
}: {
  nav: SettingsNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 lg:px-8 max-w-7xl">
      <nav
        aria-label="Settings sections"
        className="lg:w-44 xl:w-48 shrink-0"
      >
        <div className="lg:sticky lg:top-20 flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 -mx-1 px-1">
          {nav.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap lg:whitespace-normal"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0 space-y-12 pb-4">{children}</div>
    </div>
  );
}

export function SettingsSection({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {desc ? <p className="text-sm text-slate-500 mt-1">{desc}</p> : null}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{children}</div>
    </section>
  );
}
