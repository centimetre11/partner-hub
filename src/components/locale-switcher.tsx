"use client";

import { setLocaleAction } from "@/lib/i18n/locale-server";
import type { Locale } from "@/lib/i18n/locale";

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  return (
    <div className="flex items-center gap-1 mb-3">
      <form action={setLocaleAction}>
        <input type="hidden" name="locale" value="zh" />
        <button
          type="submit"
          className={`px-2 py-1 rounded text-xs ${
            locale === "zh" ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-400 hover:text-slate-700"
          }`}
        >
          中文
        </button>
      </form>
      <span className="text-slate-300 text-xs">/</span>
      <form action={setLocaleAction}>
        <input type="hidden" name="locale" value="en" />
        <button
          type="submit"
          className={`px-2 py-1 rounded text-xs ${
            locale === "en" ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-400 hover:text-slate-700"
          }`}
        >
          EN
        </button>
      </form>
    </div>
  );
}

export function LoginLocaleSwitcher({ locale }: { locale: Locale }) {
  return (
    <div className="flex justify-center gap-2 mb-4">
      <form action={setLocaleAction}>
        <input type="hidden" name="locale" value="zh" />
        <button
          type="submit"
          className={`px-3 py-1 rounded-md text-xs border ${
            locale === "zh"
              ? "border-slate-900 bg-slate-900 text-white font-medium"
              : "border-slate-200 text-slate-500 hover:border-slate-300"
          }`}
        >
          中文
        </button>
      </form>
      <form action={setLocaleAction}>
        <input type="hidden" name="locale" value="en" />
        <button
          type="submit"
          className={`px-3 py-1 rounded-md text-xs border ${
            locale === "en"
              ? "border-slate-900 bg-slate-900 text-white font-medium"
              : "border-slate-200 text-slate-500 hover:border-slate-300"
          }`}
        >
          EN
        </button>
      </form>
    </div>
  );
}
