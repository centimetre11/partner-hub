"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareChatImagesFromFiles } from "@/lib/ai-images";
import type { ContractExtractResult } from "@/lib/contract-extract-types";

export type ContractAiExtractCopy = {
  aiExtractTitle: string;
  aiExtractHint: string;
  aiExtractUpload: string;
  aiExtractPaste: string;
  aiExtractRun: string;
  aiExtractRunning: string;
  aiExtractClear: string;
  aiExtractSuccess: string;
  aiExtractSuccessCompact?: string;
  aiExtractAgain?: string;
  aiExtractFailed: string;
  aiExtractImageRequired: string;
  aiExtractOrText: string;
  aiExtractTextPlaceholder: string;
  aiExtractGatewayError?: string;
};

function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromItems = [...data.items]
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f);
  if (fromItems.length) return fromItems;
  return [...data.files].filter((f) => f.type.startsWith("image/"));
}

export function ContractAiExtract({
  copy,
  customerNameHint,
  onExtracted,
}: {
  copy: ContractAiExtractCopy;
  customerNameHint?: string | null;
  onExtracted: (result: ContractExtractResult) => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const setImageFile = useCallback(
    (file: File | null) => {
      clearPreviewUrl();
      setPendingFile(file);
      setError(null);
      setSuccess(false);
      if (file) {
        const url = URL.createObjectURL(file);
        previewUrlRef.current = url;
        setPreview(url);
      } else {
        setPreview(null);
      }
    },
    [clearPreviewUrl]
  );

  useEffect(() => {
    return () => {
      clearPreviewUrl();
    };
  }, [clearPreviewUrl]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (success) return;
      const files = imageFilesFromClipboard(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      setImageFile(files[0]);
    },
    [setImageFile, success]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      setImageFile(files[0]);
    },
    [setImageFile]
  );

  async function runExtract(source: "image" | "text") {
    if (busyRef.current) return;
    if (source === "image" && !pendingFile) {
      setError(copy.aiExtractImageRequired);
      return;
    }
    if (source === "text" && !text.trim()) {
      setError(copy.aiExtractImageRequired);
      return;
    }
    busyRef.current = true;
    setExtracting(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Record<string, unknown> = {
        customerNameHint: customerNameHint ?? "",
      };
      if (source === "image" && pendingFile) {
        // Keep payload small — large screenshots previously crashed the Node upstream (nginx 502 HTML).
        payload.images = await prepareChatImagesFromFiles([pendingFile], {
          maxSide: 896,
          quality: 0.72,
        });
      } else {
        payload.text = text.trim();
      }

      const res = await fetch("/api/ai/contract/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data: { ok?: boolean; result?: ContractExtractResult; error?: string } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error(
          copy.aiExtractGatewayError ||
            `${copy.aiExtractFailed}${res.status ? ` (HTTP ${res.status})` : ""}`
        );
      }
      if (!res.ok || !data.ok || !data.result) {
        throw new Error(
          data.error ||
            copy.aiExtractGatewayError ||
            `${copy.aiExtractFailed}${res.status ? ` (HTTP ${res.status})` : ""}`
        );
      }
      onExtracted(data.result);
      setSuccess(true);
      // Drop the big screenshot so focus moves to review + save.
      clearPreviewUrl();
      setPendingFile(null);
      setPreview(null);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.aiExtractFailed);
    } finally {
      setExtracting(false);
      busyRef.current = false;
    }
  }

  if (success && !error) {
    return (
      <div className="col-span-2 md:col-span-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 flex items-start justify-between gap-3">
        <p className="text-[11px] text-emerald-800 leading-relaxed">
          {copy.aiExtractSuccessCompact ?? copy.aiExtractSuccess}
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccess(false);
            setError(null);
          }}
          className="shrink-0 text-[11px] text-emerald-700/80 hover:text-emerald-900 underline"
        >
          {copy.aiExtractAgain ?? copy.aiExtractClear}
        </button>
      </div>
    );
  }

  return (
    <div
      className="col-span-2 md:col-span-3 rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-3 space-y-2"
      onPaste={onPaste}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-violet-900">{copy.aiExtractTitle}</div>
          <p className="text-[11px] text-violet-700/80 mt-0.5 leading-relaxed">{copy.aiExtractHint}</p>
        </div>
        <span className="text-lg opacity-70 shrink-0">✦</span>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-md border border-dashed border-violet-200 bg-white/80 px-3 py-3 text-center"
      >
        {preview ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="max-h-40 mx-auto rounded border border-slate-100" />
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setImageFile(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                {copy.aiExtractClear}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{copy.aiExtractPaste}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setImageFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {copy.aiExtractUpload}
          </button>
          <button
            type="button"
            disabled={extracting || !pendingFile}
            onClick={() => void runExtract("image")}
            className="rounded-md bg-violet-700 text-white px-2.5 py-1 text-xs hover:bg-violet-800 disabled:opacity-50"
          >
            {extracting ? copy.aiExtractRunning : copy.aiExtractRun}
          </button>
        </div>
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">{copy.aiExtractOrText}</summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={copy.aiExtractTextPlaceholder}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={extracting || !text.trim()}
            onClick={() => void runExtract("text")}
            className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs text-violet-800 hover:bg-violet-50 disabled:opacity-50"
          >
            {extracting ? copy.aiExtractRunning : copy.aiExtractRun}
          </button>
        </div>
      </details>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
