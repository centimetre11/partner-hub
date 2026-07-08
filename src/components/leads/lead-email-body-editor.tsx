"use client";

import dynamic from "next/dynamic";

const LeadEmailBodyEditorInner = dynamic(() => import("./lead-email-body-editor-inner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-slate-200 bg-white min-h-[160px] flex items-center justify-center text-sm text-slate-300">
      …
    </div>
  ),
});

export function LeadEmailBodyEditor({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
}) {
  return <LeadEmailBodyEditorInner value={value} onChange={onChange} compact={compact} />;
}
