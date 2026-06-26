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
  disabledReason,
  buttonLabel,
  uploadingLabel,
  onUploaded,
}: {
  partnerId?: string | null;
  customerId?: string | null;
  folderUrl?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
  buttonLabel: string;
  uploadingLabel: string;
  onUploaded: (asset: UploadedAsset, meta?: { folderUrl?: string | null }) => void;
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
      onUploaded(data.asset as UploadedAsset, { folderUrl: data.folderUrl ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.md,.txt,image/*"
        onChange={handleChange}
        disabled={disabled || loading}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? uploadingLabel : buttonLabel}
      </button>
      {disabled && disabledReason && (
        <p className="text-xs text-slate-400">{disabledReason}</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
