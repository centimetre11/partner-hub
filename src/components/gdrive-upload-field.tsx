"use client";

import { useRef, useState } from "react";

export type UploadedAsset = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
  thumbnailUrl: string | null;
  provider: string | null;
};

export function GdriveUploadField({
  partnerId,
  customerId,
  folderUrl,
  disabled,
  uploadingLabel,
  onUploaded,
}: {
  partnerId?: string | null;
  customerId?: string | null;
  /** 直接指定上传目录（覆盖伙伴/客户绑定目录） */
  folderUrl?: string | null;
  disabled?: boolean;
  uploadingLabel: string;
  onUploaded: (asset: UploadedAsset) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (partnerId) fd.append("partnerId", partnerId);
      if (customerId) fd.append("customerId", customerId);
      if (folderUrl) fd.append("folderUrl", folderUrl);
      const res = await fetch("/api/upload/gdrive", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onUploaded(data.asset as UploadedAsset);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        onChange={handleChange}
        disabled={disabled || loading}
        className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-slate-800 disabled:opacity-50"
      />
      {loading && <span className="block text-xs text-slate-400">{uploadingLabel}</span>}
      {error && <span className="block text-xs text-red-500">{error}</span>}
    </div>
  );
}
