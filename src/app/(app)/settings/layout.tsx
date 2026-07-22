"use client";

import { useMessages } from "@/lib/i18n/context";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const m = useMessages();

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">{m.settings.title}</h1>
          <p className="text-sm text-slate-500">{m.settings.desc}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
