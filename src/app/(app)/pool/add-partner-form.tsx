"use client";

import { useState } from "react";
import Link from "next/link";
import { createPartnerAction } from "@/lib/actions";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { AiIntakePanel } from "@/components/ai-intake-panel";

export function AddPartnerForm({
  intent = "prospect",
  taxonomy,
}: {
  intent?: "prospect" | "active";
  taxonomy?: { CATEGORY: TaxonomyOptionRow[]; INDUSTRY: TaxonomyOptionRow[] };
}) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const isActive = intent === "active";

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => setAiOpen(true)}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          ✦ AI Intake
        </button>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          + Add manually
        </button>
      </div>

      {aiOpen && (
        <AiIntakePanel scope="new_partner" intent={intent} onClose={() => setAiOpen(false)} onDone={(id) => (window.location.href = `/partners/${id}`)} />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg w-full border border-slate-200 max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{isActive ? "Add active partner" : "Add prospect"}</h3>
            <form action={createPartnerAction} className="space-y-3">
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
              <div className="flex gap-2">
                <input name="city" placeholder="City" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <input name="country" placeholder="Country" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <input name="coreBusiness" placeholder="Core business (one line)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  Cancel
                </button>
                <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">Add</button>
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
