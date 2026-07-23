"use client";

import { useState } from "react";
import { useMessages } from "@/lib/i18n/context";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";

type Props = {
  previewToken: string | null;
  /** Resolve or create share path, e.g. /lead-reviews/preview/xxx */
  resolvePath: () => Promise<string | null>;
  className?: string;
};

/**
 * 开会框架：打开 / 复制分享预览链接（过伙伴、过线索及后续场景共用）。
 */
export function MeetingShareActions({ previewToken, resolvePath, className = "" }: Props) {
  const t = useMessages().meetingUi;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  async function openPreview() {
    setCopyError(null);
    try {
      const path = await resolvePath();
      if (!path) {
        setCopyError(t.previewUnavailable);
        return;
      }
      window.open(path, "_blank", "noopener,noreferrer");
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : t.previewOpenFailed);
    }
  }

  async function copyLink() {
    setCopyError(null);
    setManualUrl(null);
    try {
      const path = await resolvePath();
      if (!path) {
        setCopyError(t.previewUnavailable);
        return;
      }
      const url = `${window.location.origin}${path}`;
      const ok = await copyTextToClipboard(url);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      setManualUrl(url);
      setCopyError(t.browserCopyBlocked);
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : t.copyFailed);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openPreview()}
          className="rounded-lg border border-sky-200 bg-sky-50 text-sky-800 px-3 py-1.5 text-sm hover:bg-sky-100"
        >
          {t.openPreview}
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          {copied ? t.copiedLink : t.copyPreviewLink}
        </button>
        {previewToken ? null : (
          <span className="text-[11px] text-slate-400 self-center">{t.firstCopyCreates}</span>
        )}
      </div>
      {copyError ? <p className="text-xs text-amber-700">{copyError}</p> : null}
      {manualUrl ? (
        <input
          type="text"
          readOnly
          value={manualUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-700 bg-slate-50"
        />
      ) : null}
    </div>
  );
}
