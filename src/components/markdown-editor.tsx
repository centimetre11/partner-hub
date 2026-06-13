"use client";

import ReactMarkdown from "react-markdown";

export function MarkdownEditor({
  name = "content",
  defaultValue = "",
  rows = 16,
}: {
  name?: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <div className="text-xs text-zinc-500 mb-1">Markdown 编辑</div>
        <textarea
          name={name}
          defaultValue={defaultValue}
          rows={rows}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <div className="text-xs text-zinc-500 mb-1">预览</div>
        <MarkdownPreview content={defaultValue} />
      </div>
    </div>
  );
}

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none rounded-lg border border-zinc-100 bg-zinc-50/50 p-4 min-h-[200px] text-zinc-800">
      <ReactMarkdown>{content || "（空）"}</ReactMarkdown>
    </div>
  );
}
