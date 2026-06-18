"use client";

import { useState } from "react";
import { useMessages } from "@/lib/i18n/context";

export type ParsedLink = {
  assetId: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  provider: string;
};

const PROVIDER_ICON: Record<string, string> = {
  kms: "🏢",
  gdrive: "📁",
  dropbox: "📦",
  web: "🔗",
};

export function providerIcon(provider?: string | null) {
  return PROVIDER_ICON[provider ?? "web"] ?? "🔗";
}

export function MaterialLinkField({
  name = "assetId",
  initial,
  onParsed,
}: {
  name?: string;
  initial?: ParsedLink | null;
  onParsed?: (link: ParsedLink) => void;
}) {
  const m = useMessages();
  const [assetId, setAssetId] = useState(initial?.assetId ?? "");
  const [link, setLink] = useState<ParsedLink | null>(initial ?? null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setAssetId("");
    setLink(null);
    setUrl("");
    setError(null);
  }

  async function parseLink() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/upload/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? m.materials.parseFailed);
      const parsed: ParsedLink = {
        assetId: data.asset.id,
        title: data.asset.filename,
        description: data.asset.description ?? null,
        url: data.asset.url,
        thumbnailUrl: data.asset.thumbnailUrl,
        provider: data.asset.provider,
      };
      setAssetId(parsed.assetId);
      setLink(parsed);
      onParsed?.(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={assetId} required={!initial} />
      <label className="block text-sm font-medium text-zinc-700">{m.materials.linkLabel}</label>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={m.materials.linkPlaceholder}
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={parseLink}
          disabled={loading || !url.trim()}
          className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm disabled:opacity-40 shrink-0"
        >
          {loading ? m.materials.parsing : m.materials.parseLink}
        </button>
      </div>
      {error && <span className="block text-xs text-red-500">{error}</span>}

      {link && (
        <div className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 bg-zinc-50/50">
          {link.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.thumbnailUrl} alt="" className="h-16 w-24 rounded-lg object-cover bg-white shrink-0 border" />
          ) : (
            <div className="h-16 w-24 rounded-lg bg-white border flex items-center justify-center text-2xl shrink-0">
              {providerIcon(link.provider)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">
                {(m.materials.providers as Record<string, string>)[link.provider] ?? link.provider}
              </span>
            </div>
            <div className="font-medium text-sm text-zinc-900 mt-0.5 line-clamp-2">{link.title}</div>
            {link.description && (
              <p className="text-xs text-zinc-500 mt-1 line-clamp-3">{link.description}</p>
            )}
            <a href={link.url} target="_blank" className="truncate block text-xs text-indigo-600 hover:underline mt-1">
              {link.url}
            </a>
          </div>
          <button type="button" onClick={reset} className="text-xs text-zinc-400 hover:text-red-600 shrink-0">
            {m.common.clear}
          </button>
        </div>
      )}
    </div>
  );
}
