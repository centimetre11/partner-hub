"use client";

import { useEffect, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { zh, en } from "@blocknote/core/locales";
import { useLocale } from "@/lib/i18n/context";
import "@blocknote/mantine/style.css";

export default function LeadEmailBodyEditorInner({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (markdown: string) => void;
  compact?: boolean;
}) {
  const locale = useLocale();
  const editor = useCreateBlockNote({ dictionary: locale === "zh" ? zh : en });
  const loadedRef = useRef("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (loadedRef.current === value) return;
    loadedRef.current = value;
    (async () => {
      const blocks = value.trim()
        ? await editor.tryParseMarkdownToBlocks(value)
        : [{ type: "paragraph" as const }];
      editor.replaceBlocks(editor.document, blocks);
    })();
  }, [editor, value]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <BlockNoteView
        editor={editor}
        theme="light"
        className={compact ? "min-h-[160px] py-2" : "min-h-[220px] py-3"}
        onChange={async () => {
          const md = await editor.blocksToMarkdownLossy();
          loadedRef.current = md;
          onChangeRef.current(md);
        }}
      />
    </div>
  );
}
