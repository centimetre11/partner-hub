"use client";

import { useState } from "react";
import { addMaterialLinkAction } from "@/lib/material-actions";
import { SolutionLinkField, type LinkPreviewState } from "@/components/solution-link-field";
import type { Messages } from "@/lib/i18n/messages/en";

const KMS_URL = "https://kms.fineres.com";

export function MaterialLinkAddForm({
  partnerId,
  customerId,
  copy,
  onAdded,
}: {
  partnerId?: string | null;
  customerId?: string | null;
  copy: Messages["gdriveMaterials"];
  onAdded?: () => void;
}) {
  const [linkPreview, setLinkPreview] = useState<LinkPreviewState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const linkUrl = String(fd.get("linkUrl") ?? "").trim();
    if (!linkUrl) {
      setError(copy.linkRequired);
      return;
    }
    if (!linkPreview) {
      setError(copy.parseBeforeSubmit);
      return;
    }
    setSubmitting(true);
    try {
      const res = await addMaterialLinkAction({ partnerId, customerId }, fd);
      if (res && "error" in res && res.error) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      setLinkPreview(null);
      (e.target as HTMLFormElement).reset();
      setSubmitting(false);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-sky-900">{copy.linksGuideTitle}</p>
        <p className="text-xs text-sky-800/80 leading-relaxed">{copy.linksGuideBody}</p>
        <a
          href={KMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 hover:underline pt-1"
        >
          🏢 {copy.openKms}
        </a>
      </div>

      <SolutionLinkField
        label={copy.linkFieldLabel}
        required
        name="linkUrl"
        placeholder={copy.linkPlaceholder}
        parseLabel={copy.parseLink}
        parsingLabel={copy.parsing}
        initialPreview={linkPreview}
        onPreview={setLinkPreview}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? copy.linkAdding : copy.linkAdd}
        </button>
      </div>
    </form>
  );
}
