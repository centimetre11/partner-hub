"use client";

import { useState } from "react";
import type { Partner, User } from "@prisma/client";
import { updatePartnerAction } from "@/lib/actions";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import { PartnerTeamFields } from "@/components/partner-team-fields";
import { parseIndustries, type TaxonomyDimension, type TaxonomyOptionRow } from "@/lib/taxonomy";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export type TaxonomyOptionsMap = Record<TaxonomyDimension, TaxonomyOptionRow[]>;

export function ProfileEditor({
  partner: p,
  users,
  taxonomy,
}: {
  partner: Partner;
  users: User[];
  taxonomy: TaxonomyOptionsMap;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-indigo-600 hover:underline">
        Edit profile
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">Edit partner profile — {p.name}</h3>
            <form
              action={async (fd) => {
                await updatePartnerAction(p.id, fd);
                setOpen(false);
              }}
              className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm"
            >
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Full company name</span>
                <input name="name" defaultValue={p.name} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Tier</span>
                <select name="tier" defaultValue={p.tier ?? ""} className={input}>
                  <option value="">Not tiered</option>
                  <option value="A">A — immediate</option>
                  <option value="B">B — priority</option>
                  <option value="C">C — follow up later</option>
                </select>
              </label>
              <TaxonomySelectField
                dimension="ARCHETYPE"
                name="partnerArchetype"
                value={p.partnerArchetype ?? ""}
                options={taxonomy.ARCHETYPE}
                emptyLabel="To be determined"
              />
              <TaxonomySelectField
                dimension="CATEGORY"
                name="category"
                value={p.category}
                options={taxonomy.CATEGORY}
              />
              <div className="md:col-span-2">
                <TaxonomyMultiField
                  dimension="INDUSTRY"
                  name="industries"
                  selected={parseIndustries(p)}
                  options={taxonomy.INDUSTRY}
                />
              </div>
              <TaxonomySelectField
                dimension="VALUE_PATTERN"
                name="valuePattern"
                value={p.valuePattern ?? ""}
                options={taxonomy.VALUE_PATTERN}
                emptyLabel="To be selected"
              />
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Dedicated headcount (FanRuan/data)</span>
                <input name="dedicatedHeadcount" defaultValue={p.dedicatedHeadcount ?? ""} placeholder="e.g. 3 full-time" className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Partner offers (value trio)</span>
                <input name="valuePartnerOffer" defaultValue={p.valuePartnerOffer ?? ""} placeholder="e.g. Tableau implementation & client relationships" className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">FanRuan offers</span>
                <input name="valueFanruanOffer" defaultValue={p.valueFanruanOffer ?? ""} placeholder="e.g. FineReport complex reporting + onsite support" className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Customer gets</span>
                <input name="valueCustomerOutcome" defaultValue={p.valueCustomerOutcome ?? ""} placeholder="e.g. regulatory reporting + self-service analytics" className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">City</span>
                <input name="city" defaultValue={p.city ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Country</span>
                <input name="country" defaultValue={p.country ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Company size</span>
                <input name="headcount" defaultValue={p.headcount ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Website</span>
                <input name="website" defaultValue={p.website ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Company type</span>
                <input name="companyType" defaultValue={p.companyType ?? ""} placeholder="Consulting / reseller / SI…" className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Certification level</span>
                <input name="certLevel" defaultValue={p.certLevel ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Core business</span>
                <input name="coreBusiness" defaultValue={p.coreBusiness ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Core capabilities</span>
                <input name="capability" defaultValue={p.capability ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Known clients</span>
                <input name="knownClients" defaultValue={p.knownClients ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Current BI tools</span>
                <input name="currentTools" defaultValue={p.currentTools ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-xs text-zinc-500">Key differentiator</span>
                <input name="keyDifferentiator" defaultValue={p.keyDifferentiator ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Core playbook</span>
                <textarea name="playbook" defaultValue={p.playbook ?? ""} rows={2} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Pitch</span>
                <textarea name="pitch" defaultValue={p.pitch ?? ""} rows={2} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Best outreach channel</span>
                <input name="bestChannel" defaultValue={p.bestChannel ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Fit score (1–10)</span>
                <input name="fitScore" type="number" min={1} max={10} defaultValue={p.fitScore ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Priority</span>
                <select name="priority" defaultValue={p.priority ?? ""} className={input}>
                  <option value="">Not set</option>
                  <option value="P0">P0 — immediate</option>
                  <option value="P1">P1 — priority</option>
                  <option value="P2">P2 — follow up</option>
                  <option value="P3">P3 — watch</option>
                </select>
              </label>
              <PartnerTeamFields
                users={users}
                salesUserId={p.salesUserId ?? p.ownerId}
                presalesUserId={p.presalesUserId}
                className={input}
              />
              <label className="flex items-center gap-2 mt-5">
                <input type="checkbox" name="manualChecked" defaultChecked={p.manualChecked} className="rounded" />
                <span className="text-xs text-zinc-600">Manually verified</span>
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">Notes</span>
                <textarea name="notes" defaultValue={p.notes ?? ""} rows={2} className={input} />
              </label>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                  Cancel
                </button>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
