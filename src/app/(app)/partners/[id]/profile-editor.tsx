"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Partner, User } from "@prisma/client";
import { updatePartnerAction } from "@/lib/actions";
import { tierSelectValue } from "@/components/ui";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import { CountryCityFields } from "@/components/country-city-fields";
import { PartnerTeamFields } from "@/components/partner-team-fields";
import { ModalPortal } from "@/components/modal-portal";
import {
  parseCapabilities,
  parseIndustries,
  type TaxonomyDimension,
  type TaxonomyOptionRow,
} from "@/lib/taxonomy";
import { useMessages } from "@/lib/i18n/context";

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export type TaxonomyOptionsMap = Record<TaxonomyDimension, TaxonomyOptionRow[]>;

export function ProfileEditor({
  partner: p,
  users,
  taxonomy,
  distributorOptions = [],
}: {
  partner: Partner;
  users: User[];
  taxonomy: TaxonomyOptionsMap;
  /** Explicit Distributors that can be selected as parent. */
  distributorOptions?: { id: string; name: string }[];
}) {
  const m = useMessages();
  const pe = m.profileEditor;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDistributor, setIsDistributor] = useState(p.isDistributor);

  return (
    <>
      <button
        onClick={() => {
          setIsDistributor(p.isDistributor);
          setError(null);
          setOpen(true);
        }}
        className="text-xs text-sky-600 hover:underline"
      >
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
                setError(null);
                try {
                  const result = await updatePartnerAction(p.id, fd);
                  if (result && "error" in result && result.error) {
                    setError(
                      result.error === "DUPLICATE_NAME"
                        ? m.common.duplicateName.replace("{name}", String(fd.get("name") ?? "").trim())
                        : result.error === "NAME_REQUIRED"
                          ? m.common.nameRequired
                          : result.error
                    );
                    return;
                  }
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
                <input name="name" defaultValue={p.name} required className={input} />
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
              <div className="col-span-2 md:col-span-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-3 space-y-2">
                <input type="hidden" name="isDistributorPresent" value="1" />
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="isDistributor"
                    checked={isDistributor}
                    disabled={!!p.parentId}
                    onChange={(e) => setIsDistributor(e.target.checked)}
                    className="rounded mt-0.5"
                  />
                  <span>
                    <span className="text-sm text-slate-800 font-medium">{pe.isDistributor}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{pe.isDistributorHint}</span>
                  </span>
                </label>
                {p.parentId ? (
                  <p className="text-xs text-amber-700">{pe.isDistributorBlockedByParent}</p>
                ) : null}
                {!isDistributor ? (
                  <label className="block space-y-1 pt-1">
                    <span className="text-xs text-slate-500">{pe.parentDistributor}</span>
                    <select name="parentId" defaultValue={p.parentId ?? ""} className={input}>
                      <option value="">{pe.parentNone}</option>
                      {distributorOptions.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <input type="hidden" name="parentId" value="" />
                )}
              </div>
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
              <div className="md:col-span-2">
                <TaxonomyMultiField
                  dimension="CAPABILITY"
                  name="capabilities"
                  selected={parseCapabilities(p)}
                  options={taxonomy.CAPABILITY}
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
              <CountryCityFields
                defaultCountry={p.country}
                defaultCity={p.city}
                showLabels
                countryLabelText={pe.country}
                cityLabelText={pe.city}
                inputClassName={input}
                fieldClassName="space-y-1"
              />
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
              <div className="col-span-2 md:col-span-3 pt-1 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-600 mb-2">{pe.annualValueSection}</p>
                <p className="text-[11px] text-slate-400 mb-3">{pe.annualValueHint}</p>
              </div>
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
              {error && (
                <p className="col-span-2 md:col-span-3 text-xs text-red-600">{error}</p>
              )}
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
