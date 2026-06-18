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
          className={`px-2 py-1 rounded text-xs transition-colors ${
            locale === "zh" ? "bg-indigo-600/30 text-indigo-200 font-medium" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          中文
        </button>
      </form>
      <span className="text-zinc-600 text-xs">/</span>
      <form action={setLocaleAction}>
        <input type="hidden" name="locale" value="en" />
        <button
          type="submit"
          className={`px-2 py-1 rounded text-xs transition-colors ${
            locale === "en" ? "bg-indigo-600/30 text-indigo-200 font-medium" : "text-zinc-500 hover:text-zinc-300"
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
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            locale === "zh"
              ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-medium"
              : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
          }`}
        >
          中文
        </button>
      </form>
      <form action={setLocaleAction}>
        <input type="hidden" name="locale" value="en" />
        <button
          type="submit"
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            locale === "en"
              ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-medium"
              : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
          }`}
        >
          EN
        </button>
      </form>
    </div>
  );
}
