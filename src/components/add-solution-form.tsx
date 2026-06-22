"use client";

import { useState } from "react";
import { createSolutionFromLinksAction } from "@/lib/content-actions";
import { SOLUTION_GDRIVE_FOLDER_URL } from "@/lib/solution-config";
import { SolutionLinkField, type LinkPreviewState } from "@/components/solution-link-field";
import type { Messages } from "@/lib/i18n/messages/en";

const KMS_URL = "https://kms.fineres.com";

export function AddSolutionForm({
  partnerId,
  copy,
}: {
  partnerId: string;
  copy: Messages["partnerDetail"]["solutionsSection"];
}) {
  const [solutionPreview, setSolutionPreview] = useState<LinkPreviewState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const solutionUrl = String(fd.get("solutionUrl") ?? "").trim();
    if (!solutionUrl) {
      setError(copy.solutionLinkRequired);
      return;
    }
    if (!solutionPreview) {
      setError(copy.parseBeforeSubmit);
      return;
    }
    setSubmitting(true);
    try {
      await createSolutionFromLinksAction(partnerId, fd);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-4 text-sm">
      <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-sky-900">{copy.uploadGuideTitle}</p>
        <p className="text-xs text-sky-800/80 leading-relaxed">{copy.uploadGuideBody}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href={SOLUTION_GDRIVE_FOLDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 hover:underline"
          >
            📁 {copy.openGdriveFolder}
          </a>
          <a
            href={KMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 hover:underline"
          >
            🏢 {copy.openKms}
          </a>
        </div>
      </div>

      <SolutionLinkField
        label={copy.solutionDocLink}
        required
        name="solutionUrl"
        placeholder={copy.solutionDocLinkPlaceholder}
        parseLabel={copy.parseLink}
        parsingLabel={copy.parsingLink}
        onPreview={setSolutionPreview}
      />
      <SolutionLinkField
        label={copy.targetCustomerLink}
        name="targetCustomerUrl"
        placeholder={copy.targetCustomerLinkPlaceholder}
        parseLabel={copy.parseLink}
        parsingLabel={copy.parsingLink}
      />
      <SolutionLinkField
        label={copy.painPointLink}
        name="painPointUrl"
        placeholder={copy.painPointLinkPlaceholder}
        parseLabel={copy.parseLink}
        parsingLabel={copy.parsingLink}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 text-white px-4 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? copy.adding : copy.add}
        </button>
      </div>
    </form>
  );
}
