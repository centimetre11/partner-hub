"use client";

import { useState } from "react";
import Link from "next/link";
import { createPartnerAction } from "@/lib/actions";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import { CountryCityFields } from "@/components/country-city-fields";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { AiIntakePanel } from "@/components/ai-intake-panel";
import { useMessages } from "@/lib/i18n/context";

export function AddPartnerForm({
  intent = "prospect",
  taxonomy,
  defaultParentId,
  distributorOptions,
  parentLabel,
  compact = false,
}: {
  intent?: "prospect" | "active";
  taxonomy?: { CATEGORY: TaxonomyOptionRow[]; INDUSTRY: TaxonomyOptionRow[] };
  /** Prefill parent distributor (e.g. when adding a sub-partner from distributor detail). */
  defaultParentId?: string;
  /** Candidates for parent dropdown (top-level partners). */
  distributorOptions?: { id: string; name: string }[];
  /** When set with defaultParentId, lock parent and show this label instead of a select. */
  parentLabel?: string;
  /** Compact trigger for embedding in card actions. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isActive = intent === "active";
  const messages = useMessages();
  const p = messages.pool;

  const triggerClass = compact
    ? "text-xs text-sky-600 hover:underline"
    : "rounded-lg border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50";

  return (
    <>
      <div className={compact ? "inline-flex" : "flex gap-2"}>
        {!compact && (
          <button
            onClick={() => setAiOpen(true)}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            {p.aiIntake}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className={triggerClass}
        >
          {compact ? messages.partnerDetail.addSubPartner : p.addManually}
        </button>
      </div>

      {aiOpen && (
        <AiIntakePanel
          scope="new_partner"
          intent={intent}
          parentId={defaultParentId}
          onClose={() => setAiOpen(false)}
          onDone={(id) => (window.location.href = `/partners/${id}`)}
        />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-lg w-full border border-slate-200 max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{isActive ? "Add active partner" : "Add prospect"}</h3>
            <form
              action={async (fd) => {
                setSaving(true);
                setError(null);
                try {
                  const result = await createPartnerAction(fd);
                  if (result && typeof result === "object" && "error" in result && result.error) {
                    setError(result.error);
                  }
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-3"
            >
              <input type="hidden" name="intent" value={intent} />
              <input name="name" required placeholder="Company name *" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {taxonomy ? (
                <>
                  <TaxonomySelectField dimension="CATEGORY" name="category" value="OTHER" options={taxonomy.CATEGORY} />
                  <TaxonomyMultiField dimension="INDUSTRY" name="industries" selected={[]} options={taxonomy.INDUSTRY} />
                </>
              ) : (
                <p className="text-xs text-slate-400">
                  Refresh the page to load taxonomy options, or manage them in the <Link href="/taxonomy" className="text-sky-600 hover:underline">Taxonomy Library</Link>
                </p>
              )}
              <CountryCityFields inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input name="coreBusiness" placeholder="Core business (one line)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              {(defaultParentId || (distributorOptions && distributorOptions.length > 0)) && (
                <label className="block space-y-1">
                  <span className="text-xs text-slate-500">{p.parentDistributor}</span>
                  {defaultParentId && parentLabel ? (
                    <>
                      <input type="hidden" name="parentId" value={defaultParentId} />
                      <p className="text-sm text-slate-700">{parentLabel}</p>
                    </>
                  ) : distributorOptions ? (
                    <select
                      name="parentId"
                      defaultValue={defaultParentId ?? ""}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">{p.parentNone}</option>
                      {distributorOptions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  ) : defaultParentId ? (
                    <input type="hidden" name="parentId" value={defaultParentId} />
                  ) : null}
                </label>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  Cancel
                </button>
                <button disabled={saving} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60">
                  {saving ? "…" : "Add"}
                </button>
              </div>
            </form>
            <p className="text-xs text-slate-400 mt-3">
              {isActive
                ? "Creates an active partner with starter tasks. Prefer not to fill out the form? Use ✦ AI Intake above."
                : "Prefer not to fill out the form? Use ✦ AI Intake above — paste meeting notes or a company intro for AI to process."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
