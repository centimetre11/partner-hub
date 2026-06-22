"use client";

import { useState } from "react";
import { deleteSolutionAction, updateSolutionLinkNotesAction } from "@/lib/content-actions";
import { SolutionLinkField, type LinkPreviewState } from "@/components/solution-link-field";
import type { Messages } from "@/lib/i18n/messages/en";

export function EditSolutionForm({
  partnerId,
  solutionId,
  defaultLinkUrl,
  initialPreview,
  defaultNotes,
  copy,
}: {
  partnerId: string;
  solutionId: string;
  defaultLinkUrl: string;
  initialPreview: LinkPreviewState | null;
  defaultNotes: string;
  copy: Messages["partnerDetail"]["solutionsSection"];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      await updateSolutionLinkNotesAction(partnerId, solutionId, fd);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(copy.deleteConfirm)) return;
    setSubmitting(true);
    try {
      await deleteSolutionAction(partnerId, solutionId);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <SolutionLinkField
        label={copy.linkLabel}
        name="linkUrl"
        placeholder={copy.linkPlaceholder}
        parseLabel={copy.parseLink}
        parsingLabel={copy.parsingLink}
        defaultUrl={defaultLinkUrl}
        initialPreview={initialPreview}
      />

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{copy.notes}</label>
        <textarea
          name="notes"
          defaultValue={defaultNotes}
          placeholder={copy.notesPlaceholder}
          rows={3}
          className={input}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={submitting}
          className="text-xs text-slate-400 hover:text-red-600 px-2 disabled:opacity-50"
        >
          {copy.delete}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  );
}
