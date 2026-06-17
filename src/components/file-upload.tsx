"use client";

import { useState } from "react";

type LinkInfo = { url: string; thumbnailUrl: string | null; provider: string };

export function FileUploadField({
  name = "assetId",
  onUploaded,
}: {
  name?: string;
  onUploaded?: (id: string) => void;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [assetId, setAssetId] = useState("");
  const [filename, setFilename] = useState("");
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setAssetId("");
    setFilename("");
    setLink(null);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAssetId(data.asset.id);
      setFilename(data.asset.filename);
      setLink(null);
      onUploaded?.(data.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
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
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      setAssetId(data.asset.id);
      setFilename(data.asset.filename);
      setLink({ url: data.asset.url, thumbnailUrl: data.asset.thumbnailUrl, provider: data.asset.provider });
      onUploaded?.(data.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const tabBase = "px-3 py-1 text-xs rounded-md transition-colors";

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={assetId} />
      <div className="inline-flex rounded-lg bg-zinc-100 p-0.5">
        <button
          type="button"
          onClick={() => { setMode("file"); setError(null); }}
          className={`${tabBase} ${mode === "file" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => { setMode("link"); setError(null); }}
          className={`${tabBase} ${mode === "link" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}
        >
          Paste cloud link
        </button>
      </div>

      {mode === "file" ? (
        <input type="file" onChange={uploadFile} disabled={loading} className="block text-sm" />
      ) : (
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste cloud / document share link"
            className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={parseLink}
            disabled={loading || !url.trim()}
            className="rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Parse
          </button>
        </div>
      )}

      {loading && <span className="text-xs text-zinc-400">{mode === "file" ? "Uploading…" : "Parsing…"}</span>}
      {error && <span className="block text-xs text-red-500">{error}</span>}

      {assetId && link && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 max-w-sm">
          {link.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.thumbnailUrl} alt="" className="h-12 w-16 rounded object-cover bg-zinc-50" />
          ) : (
            <div className="h-12 w-16 rounded bg-zinc-100 flex items-center justify-center text-lg">🔗</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-zinc-800">{filename}</div>
            <a href={link.url} target="_blank" className="truncate block text-xs text-indigo-500 hover:underline">
              {link.url}
            </a>
          </div>
          <button type="button" onClick={reset} className="text-xs text-zinc-400 hover:text-red-600">Clear</button>
        </div>
      )}
      {assetId && !link && filename && (
        <span className="flex items-center gap-2 text-xs text-emerald-600">
          Uploaded: {filename}
          <button type="button" onClick={reset} className="text-zinc-400 hover:text-red-600">Clear</button>
        </span>
      )}
    </div>
  );
}
