"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { zh, en } from "@blocknote/core/locales";
import { useLocale } from "@/lib/i18n/context";
import "@blocknote/mantine/style.css";

export default function RichEditorInner({
  name = "content",
  defaultValue = "",
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const locale = useLocale();
  const editor = useCreateBlockNote({ dictionary: locale === "zh" ? zh : en });
  const [markdown, setMarkdown] = useState(defaultValue);
  const initedRef = useRef(false);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    if (!defaultValue.trim()) return;
    (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(defaultValue);
      if (blocks.length) editor.replaceBlocks(editor.document, blocks);
    })();
  }, [editor, defaultValue]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <input type="hidden" name={name} value={markdown} />
      <BlockNoteView
        editor={editor}
        theme="light"
        className="min-h-[340px] py-3"
        onChange={async () => {
          const md = await editor.blocksToMarkdownLossy();
          setMarkdown(md);
        }}
      />
    </div>
  );
}
