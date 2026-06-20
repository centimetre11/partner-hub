"use client";

import ReactMarkdown from "react-markdown";

const prose =
  "prose prose-sm prose-slate max-w-none prose-headings:font-semibold prose-a:text-sky-600 prose-table:text-sm prose-th:px-2 prose-td:px-2";

export function KnowhowMarkdown({ content, className = "" }: { content: string; className?: string }) {
  if (!content.trim()) return null;
  return (
    <div className={`${prose} ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
