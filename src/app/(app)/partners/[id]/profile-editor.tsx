"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Partner, User } from "@prisma/client";
import { updatePartnerAction } from "@/lib/actions";
import { tierSelectValue } from "@/components/ui";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import { PartnerTeamFields } from "@/components/partner-team-fields";
import { ModalPortal } from "@/components/modal-portal";
import { parseIndustries, type TaxonomyDimension, type TaxonomyOptionRow } from "@/lib/taxonomy";
import { useMessages } from "@/lib/i18n/context";

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

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
  const m = useMessages();
  const pe = m.profileEditor;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-sky-600 hover:underline">
        {pe.editProfile}
      </button>
      {open && (
        <ModalPortal onClose={() => !saving && setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-3xl p-6 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-semibold mb-4">{pe.title.replace("{name}", p.name)}</h3>
            <form
              action={async (fd) => {
                setSaving(true);
                try {
                  await updatePartnerAction(p.id, fd);
                  setOpen(false);
                  router.refresh();
                } finally {
                  setSaving(false);
                }
              }}
              className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm"
            >
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.fullName}</span>
                <input name="name" defaultValue={p.name} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{m.common.tier}</span>
                <select name="tier" defaultValue={tierSelectValue(p.tier)} className={input}>
                  <option value="">{pe.notTiered}</option>
                  <option value="A">{pe.tierA}</option>
                  <option value="B">{pe.tierB}</option>
                  <option value="C">{pe.tierC}</option>
                </select>
              </label>
              <TaxonomySelectField
                dimension="ARCHETYPE"
                name="partnerArchetype"
                value={p.partnerArchetype ?? ""}
                options={taxonomy.ARCHETYPE}
                emptyLabel={pe.tbd}
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
                emptyLabel={pe.toBeSelected}
              />
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.dedicatedHeadcountLabel}</span>
                <input name="dedicatedHeadcount" defaultValue={p.dedicatedHeadcount ?? ""} placeholder={pe.dedicatedHeadcountPlaceholder} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.valuePartnerOffer}</span>
                <input name="valuePartnerOffer" defaultValue={p.valuePartnerOffer ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.valueFanruanOffer}</span>
                <input name="valueFanruanOffer" defaultValue={p.valueFanruanOffer ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.valueCustomerOutcome}</span>
                <input name="valueCustomerOutcome" defaultValue={p.valueCustomerOutcome ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.city}</span>
                <input name="city" defaultValue={p.city ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.country}</span>
                <input name="country" defaultValue={p.country ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.headcount}</span>
                <input name="headcount" defaultValue={p.headcount ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.website}</span>
                <input name="website" defaultValue={p.website ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.coreBusiness}</span>
                <input name="coreBusiness" defaultValue={p.coreBusiness ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.capability}</span>
                <input name="capability" defaultValue={p.capability ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.knownClients}</span>
                <input name="knownClients" defaultValue={p.knownClients ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.partnerAnnualRevenue}</span>
                <input name="partnerAnnualRevenue" defaultValue={p.partnerAnnualRevenue ?? ""} placeholder={pe.partnerAnnualRevenuePlaceholder} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">{pe.partnerDealsPerYear}</span>
                <input name="partnerDealsPerYear" defaultValue={p.partnerDealsPerYear ?? ""} placeholder={pe.partnerDealsPerYearPlaceholder} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.estimatedAnnualValue}</span>
                <input name="estimatedAnnualValue" defaultValue={p.estimatedAnnualValue ?? ""} placeholder={pe.estimatedAnnualValuePlaceholder} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.currentTools}</span>
                <input name="currentTools" defaultValue={p.currentTools ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.corePlaybook}</span>
                <textarea name="playbook" defaultValue={p.playbook ?? ""} rows={2} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.pitch}</span>
                <textarea name="pitch" defaultValue={p.pitch ?? ""} rows={2} className={input} />
              </label>
              <PartnerTeamFields
                users={users}
                salesUserId={p.salesUserId ?? p.ownerId}
                presalesUserId={p.presalesUserId}
                className={input}
              />
              <label className="flex items-center gap-2 mt-5">
                <input type="checkbox" name="manualChecked" defaultChecked={p.manualChecked} className="rounded" />
                <span className="text-xs text-slate-600">{pe.manuallyVerified}</span>
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-slate-500">{pe.notes}</span>
                <textarea name="notes" defaultValue={p.notes ?? ""} rows={2} className={input} />
              </label>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  {m.common.cancel}
                </button>
                <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60">
                  {saving ? m.common.loading : pe.save}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
