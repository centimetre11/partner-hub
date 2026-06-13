"use client";

import dynamic from "next/dynamic";

const RichEditorInner = dynamic(() => import("./rich-editor-inner"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-zinc-200 bg-white min-h-[340px] flex items-center justify-center text-sm text-zinc-300">
      编辑器加载中…
    </div>
  ),
});

export function RichEditor(props: { name?: string; defaultValue?: string; placeholder?: string }) {
  return <RichEditorInner {...props} />;
}
