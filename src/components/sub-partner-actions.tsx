"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { attachPartnerToDistributorAction, createPartnerAction } from "@/lib/actions";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { useMessages } from "@/lib/i18n/context";

type AttachCandidate = { id: string; name: string; status: string };

/**
 * Sub-partner entry from a Distributor detail page.
 * Reuses createPartnerAction for "new", and attachPartnerToDistributorAction for existing.
 */
export function SubPartnerActions({
  distributorId,
  distributorName,
  attachCandidates,
  taxonomy,
}: {
  distributorId: string;
  distributorName: string;
  attachCandidates: AttachCandidate[];
  taxonomy: { CATEGORY: TaxonomyOptionRow[]; INDUSTRY: TaxonomyOptionRow[] };
}) {
  const m = useMessages();
  const pd = m.partnerDetail;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"attach" | "create">("attach");
  const [q, setQ] = useState("");
  const [childId, setChildId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return attachCandidates.slice(0, 40);
    return attachCandidates
      .filter((c) => c.name.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [attachCandidates, q]);

  function close() {
    if (saving) return;
    setOpen(false);
    setError(null);
    setQ("");
    setChildId("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode("attach");
          setError(null);
          setOpen(true);
        }}
        className="text-xs text-sky-600 hover:underline"
      >
        {pd.addSubPartner}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">{pd.addSubPartnerTitle}</h3>
            <p className="text-xs text-slate-500 mb-4">
              {pd.addSubPartnerUnder.replace("{name}", distributorName)}
            </p>

            <div className="flex gap-1 mb-4 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => { setMode("attach"); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                  mode === "attach" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {pd.attachExistingTab}
              </button>
              <button
                type="button"
                onClick={() => { setMode("create"); setError(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                  mode === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {pd.createNewTab}
              </button>
            </div>

            {mode === "attach" ? (
              <form
                action={async (fd) => {
                  setSaving(true);
                  setError(null);
                  try {
                    const result = await attachPartnerToDistributorAction(fd);
                    if (result && "error" in result && result.error) {
                      setError(result.error);
                      return;
                    }
                    close();
                    router.refresh();
                  } finally {
                    setSaving(false);
                  }
                }}
                className="space-y-3"
              >
                <input type="hidden" name="parentId" value={distributorId} />
                <input type="hidden" name="childId" value={childId} />
                <label className="block space-y-1">
                  <span className="text-xs text-slate-500">{pd.attachSearchLabel}</span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={pd.attachSearchPlaceholder}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-slate-400">{pd.attachEmpty}</p>
                  ) : (
                    filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setChildId(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                          childId === c.id ? "bg-sky-50 text-sky-800" : "text-slate-800"
                        }`}
                      >
                        {c.name}
                        <span className="ml-2 text-[11px] text-slate-400">{c.status}</span>
                      </button>
                    ))
                  )}
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" disabled={saving} onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                    {m.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !childId}
                    className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving ? m.common.loading : pd.attachConfirm}
                  </button>
                </div>
              </form>
            ) : (
              <form
                action={async (fd) => {
                  setSaving(true);
                  setError(null);
                  try {
                    const result = await createPartnerAction(fd);
                    if (result && typeof result === "object" && "error" in result && result.error) {
                      setError(result.error);
                    }
                    // createPartnerAction redirects on success
                  } finally {
                    setSaving(false);
                  }
                }}
                className="space-y-3"
              >
                <input type="hidden" name="intent" value="active" />
                <input type="hidden" name="parentId" value={distributorId} />
                <input name="name" required placeholder={pd.createNamePlaceholder} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <TaxonomySelectField dimension="CATEGORY" name="category" value="OTHER" options={taxonomy.CATEGORY} />
                <TaxonomyMultiField dimension="INDUSTRY" name="industries" selected={[]} options={taxonomy.INDUSTRY} />
                <div className="flex gap-2">
                  <input name="city" placeholder="City" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input name="country" placeholder="Country" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <input name="coreBusiness" placeholder={pd.createCoreBusinessPlaceholder} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <p className="text-[11px] text-slate-400">{pd.createReuseHint}</p>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" disabled={saving} onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                    {m.common.cancel}
                  </button>
                  <button disabled={saving} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60">
                    {saving ? m.common.loading : pd.createConfirm}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
