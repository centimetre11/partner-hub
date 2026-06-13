"use client";

import { useState } from "react";
import { FileUploadField } from "@/components/file-upload";

export function SolutionAssetUpload({
  partnerId,
  solutionId,
  action,
}: {
  partnerId: string;
  solutionId: string;
  action: (partnerId: string, solutionId: string, assetId: string, label?: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");

  async function onUploaded(assetId: string) {
    await action(partnerId, solutionId, assetId, label || undefined);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="附件说明（如：架构图）"
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm w-40"
      />
      <FileUploadField onUploaded={onUploaded} />
    </div>
  );
}
