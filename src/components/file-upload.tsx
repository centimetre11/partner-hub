"use client";

import { useState } from "react";

export function FileUploadField({ name = "assetId", onUploaded }: { name?: string; onUploaded?: (id: string) => void }) {
  const [assetId, setAssetId] = useState("");
  const [filename, setFilename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "上传失败");
      setAssetId(data.asset.id);
      setFilename(data.asset.filename);
      onUploaded?.(data.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <input type="hidden" name={name} value={assetId} />
      <input type="file" onChange={upload} disabled={loading} className="text-sm" />
      {filename && <span className="text-xs text-emerald-600">已上传：{filename}</span>}
      {loading && <span className="text-xs text-zinc-400">上传中…</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
