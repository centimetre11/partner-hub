"use client";

import { useState } from "react";
import { providerIcon } from "@/lib/provider-icon";

export type LinkPreviewState = {
  url: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  provider: string;
};

export function SolutionLinkField({
  label,
  required,
  placeholder,
  name,
  parseLabel,
  parsingLabel,
  onPreview,
}: {
  label: string;
  required?: boolean;
  placeholder: string;
  name: string;
  parseLabel: string;
  parsingLabel: string;
  onPreview?: (preview: LinkPreviewState | null) => void;
}) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<LinkPreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function clearPreview() {
    setPreview(null);
    onPreview?.(null);
  }

  async function parseLink() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/link/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      const next = data.preview as LinkPreviewState;
      setPreview(next);
      onPreview?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      clearPreview();
    } finally {
      setLoading(false);
    }
  }

  function handleUrlChange(value: string) {
    setUrl(value);
    if (preview && value.trim() !== preview.url) {
      clearPreview();
    }
  }

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type="hidden" name={name} value={url.trim()} />
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={input}
        />
        <button
          type="button"
          onClick={parseLink}
          disabled={loading || !url.trim()}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {loading ? parsingLabel : parseLabel}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {preview && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          {preview.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.thumbnailUrl}
              alt=""
              className="h-14 w-20 rounded object-cover bg-white border border-slate-100 shrink-0"
            />
          ) : (
            <div className="h-14 w-20 rounded bg-white border border-slate-100 flex items-center justify-center text-2xl shrink-0">
              {providerIcon(preview.provider)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-900 truncate">{preview.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                {preview.provider}
              </span>
            </div>
            {preview.description && (
              <p className="text-xs text-slate-600 mt-1 line-clamp-3">{preview.description}</p>
            )}
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-600 hover:underline mt-1 block truncate"
            >
              {preview.url}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
