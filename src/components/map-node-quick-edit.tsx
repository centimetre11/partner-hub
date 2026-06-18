"use client";

import { useEffect } from "react";
import type { Partner, User } from "@prisma/client";
import { updatePartnerAction, setPipelineStageAction } from "@/lib/actions";
import { tierSelectValue } from "@/components/ui";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import { PartnerTeamFields } from "@/components/partner-team-fields";
import { parseIndustries, type TaxonomyDimension, type TaxonomyOptionRow } from "@/lib/taxonomy";
import { type FrameworkMapNode } from "@/lib/partner-framework";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export type TaxonomyOptionsMap = Record<TaxonomyDimension, TaxonomyOptionRow[]>;

export function MapNodeQuickEdit({
  node,
  partner,
  users,
  pipelineStages,
  taxonomy,
  onClose,
}: {
  node: FrameworkMapNode;
  partner: Partner;
  users: User[];
  pipelineStages: { stage: number; name: string }[];
  taxonomy: TaxonomyOptionsMap;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Edit · {node.label}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{node.hint}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">
            ×
          </button>
        </div>

        {node.id === "stage" ? (
          <>
            <p className="text-xs text-zinc-500 mb-3">Select pipeline stage (click to save)</p>
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
              {pipelineStages.map((s) => (
                <form key={s.stage} action={setPipelineStageAction.bind(null, partner.id, s.stage)}>
                  <button
                    type="submit"
                    className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                      partner.pipelineStage === s.stage
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300"
                    }`}
                  >
                    {s.stage}. {s.name}
                  </button>
                </form>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                Close
              </button>
            </div>
          </>
        ) : (
          <form
            action={async (fd) => {
              await updatePartnerAction(partner.id, fd);
              onClose();
            }}
            className="space-y-3 text-sm"
          >
            {node.id === "tier" && (
              <label className="block space-y-1">
                <span className="text-xs text-zinc-500">Tier</span>
                <select name="tier" defaultValue={tierSelectValue(partner.tier)} className={input}>
                  <option value="">Not tiered</option>
                  <option value="A">A — immediate</option>
                  <option value="B">B — priority</option>
                  <option value="C">C — follow up later</option>
                </select>
              </label>
            )}
            {node.id === "archetype" && (
              <TaxonomySelectField
                dimension="ARCHETYPE"
                name="partnerArchetype"
                value={partner.partnerArchetype ?? ""}
                options={taxonomy.ARCHETYPE}
                emptyLabel="To be determined"
              />
            )}
            {node.id === "category" && (
              <TaxonomySelectField
                dimension="CATEGORY"
                name="category"
                value={partner.category}
                options={taxonomy.CATEGORY}
              />
            )}
            {node.id === "industry" && (
              <TaxonomyMultiField
                dimension="INDUSTRY"
                name="industries"
                selected={parseIndustries(partner)}
                options={taxonomy.INDUSTRY}
              />
            )}
            {node.id === "value_pattern" && (
              <TaxonomySelectField
                dimension="VALUE_PATTERN"
                name="valuePattern"
                value={partner.valuePattern ?? ""}
                options={taxonomy.VALUE_PATTERN}
                emptyLabel="To be selected"
              />
            )}
            {node.id === "value_stack" && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-500">Partner offers</span>
                  <input name="valuePartnerOffer" defaultValue={partner.valuePartnerOffer ?? ""} className={input} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-500">FanRuan offers</span>
                  <input name="valueFanruanOffer" defaultValue={partner.valueFanruanOffer ?? ""} className={input} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-500">Customer gets</span>
                  <input name="valueCustomerOutcome" defaultValue={partner.valueCustomerOutcome ?? ""} className={input} />
                </label>
              </>
            )}
            {node.id === "playbook" && (
              <label className="block space-y-1">
                <span className="text-xs text-zinc-500">playbook</span>
                <textarea name="playbook" defaultValue={partner.playbook ?? ""} rows={3} className={input} />
              </label>
            )}
            {node.id === "pitch" && (
              <label className="block space-y-1">
                <span className="text-xs text-zinc-500">pitch</span>
                <textarea name="pitch" defaultValue={partner.pitch ?? ""} rows={3} className={input} />
              </label>
            )}
            {node.id === "domain_commitment" && (
              <>
                <PartnerTeamFields
                  users={users}
                  salesUserId={partner.salesUserId ?? partner.ownerId}
                  presalesUserId={partner.presalesUserId}
                  className={input}
                />
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-500">Dedicated headcount</span>
                  <input name="dedicatedHeadcount" defaultValue={partner.dedicatedHeadcount ?? ""} className={input} />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                Cancel
              </button>
              <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
