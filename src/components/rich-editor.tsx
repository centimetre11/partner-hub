"use client";

import dynamic from "next/dynamic";
import { LocaleProvider } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/locale";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";

const RichEditorInner = dynamic(() => import("./rich-editor-inner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-slate-200 bg-white min-h-[340px] flex items-center justify-center text-sm text-slate-300">
      …
    </div>
  ),
});

export function RichEditor(props: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  locale?: Locale;
}) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  return (
    <LocaleProvider locale={locale}>
      <RichEditorInner {...props} />
    </LocaleProvider>
  );
}
