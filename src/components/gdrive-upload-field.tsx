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

type UploadPhase = "idle" | "matching" | "uploading" | "success" | "error";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type GdriveUploadResult = {
  id?: string;
  name?: string;
  webViewLink?: string;
  error?: { message?: string };
};

function uploadFileDirectToGoogle(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<GdriveUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as GdriveUploadResult);
        } catch {
          reject(new Error("Invalid response from Google Drive"));
        }
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText) as GdriveUploadResult;
        reject(new Error(data.error?.message || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(file);
  });
}

export function GdriveUploadField({
  partnerId,
  customerId,
  folderUrl,
  disabled,
  disabledReason,
  buttonLabel,
  matchingLabel,
  uploadingLabel,
  successLabel,
  onUploaded,
  onError,
}: {
  partnerId?: string | null;
  customerId?: string | null;
  folderUrl?: string | null;
  disabled?: boolean;
  disabledReason?: string | null;
  buttonLabel: string;
  matchingLabel: string;
  uploadingLabel: string;
  successLabel: string;
  onUploaded: (meta?: { folderUrl?: string | null; filename?: string }) => void;
  onError?: (message: string, code?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [activeFile, setActiveFile] = useState<{ name: string; size: number } | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loading = phase === "matching" || phase === "uploading";

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveFile({ name: file.name, size: file.size });
    setError(null);
    setUploadPercent(0);
    setPhase(folderUrl ? "uploading" : "matching");
    try {
      if (!folderUrl) {
        await new Promise((r) => setTimeout(r, 300));
        setPhase("uploading");
      }

      const initRes = await fetch("/api/upload/gdrive/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          partnerId: partnerId ?? undefined,
          customerId: customerId ?? undefined,
          folderUrl: folderUrl ?? undefined,
        }),
      });
      const initData = (await initRes.json()) as {
        error?: string;
        code?: string;
        uploadUrl?: string;
        folderUrl?: string | null;
      };
      if (!initRes.ok || !initData.uploadUrl) {
        const msg = initData.error ?? "Upload init failed";
        setError(msg);
        setPhase("error");
        onError?.(msg, initData.code);
        return;
      }

      await uploadFileDirectToGoogle(initData.uploadUrl, file, setUploadPercent);

      setPhase("success");
      onUploaded({
        folderUrl: initData.folderUrl ?? null,
        filename: file.name,
      });
      window.setTimeout(() => {
        setPhase("idle");
        setActiveFile(null);
        setUploadPercent(0);
      }, 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("error");
      onError?.(msg);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const statusText =
    phase === "matching"
      ? matchingLabel
      : phase === "uploading" && activeFile
        ? uploadingLabel
            .replace("{filename}", activeFile.name)
            .replace("{size}", formatFileSize(activeFile.size))
        : phase === "success" && activeFile
          ? successLabel.replace("{filename}", activeFile.name)
          : null;

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
        onClick={() => {
          setError(null);
          setPhase("idle");
          inputRef.current?.click();
        }}
        disabled={disabled || loading}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (statusText ?? buttonLabel) : buttonLabel}
      </button>

      {loading && (
        <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-sky-900">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700 shrink-0" />
            <span className="min-w-0 truncate">
              {statusText}
              {phase === "uploading" && uploadPercent > 0 ? ` · ${uploadPercent}%` : ""}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-150 ease-out"
              style={{
                width:
                  phase === "matching"
                    ? "33%"
                    : `${Math.max(uploadPercent, phase === "uploading" ? 2 : 0)}%`,
              }}
            />
          </div>
        </div>
      )}

      {phase === "success" && statusText && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
          <span>✓</span>
          <span className="truncate">{statusText}</span>
        </p>
      )}

      {disabled && disabledReason && (
        <p className="text-xs text-slate-400">{disabledReason}</p>
      )}
      {error && <p className="text-xs text-red-600 leading-relaxed">{error}</p>}
    </div>
  );
}
