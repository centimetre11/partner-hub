"use client";

import { useState } from "react";
import { FileUploadField } from "@/components/file-upload";

export function DocumentAssetUpload({
  documentId,
  action,
}: {
  documentId: string;
  action: (documentId: string, assetId: string, label?: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");

  async function onUploaded(assetId: string) {
    await action(documentId, assetId, label || undefined);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Attachment label (optional)"
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-40"
      />
      <FileUploadField onUploaded={onUploaded} />
    </div>
  );
}
