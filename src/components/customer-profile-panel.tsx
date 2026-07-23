"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, TierBadge, tierSelectValue } from "@/components/ui";
import { AiAddButton } from "@/components/ai-add-button";
import { updateCustomerAction, addCustomerPartnerAction, removeCustomerPartnerAction } from "@/lib/customer-actions";
import { TaxonomySelectField } from "@/components/taxonomy-fields";
import { CountryCityFields } from "@/components/country-city-fields";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { profileEnrichSeedMessage } from "@/lib/intake-profile-enrich";
import { useMessages, useLabels, useLocale } from "@/lib/i18n/context";
import { formatTierLabel, resolveCustomerTier } from "@/lib/tier";

type Option = { id: string; name: string; role?: string };

type BoundPartner = { id: string; name: string; relation: string };

type SegmentOptions = {
  customerSegment: TaxonomyOptionRow[];
  buyingTrigger: TaxonomyOptionRow[];
  entryPath: TaxonomyOptionRow[];
};

type CustomerProfile = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  customerSegment: string | null;
  buyingTrigger: string | null;
  entryPath: string | null;
  tier: string | null;
  icpTier: string | null;
  scale: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
  ownerId: string | null;
  owner: { name: string } | null;
  presalesUserId: string | null;
  presalesUser: { name: string } | null;
  satisfactionUserId: string | null;
  satisfactionUser: { name: string } | null;
  boundPartners: BoundPartner[];
  partnerRelation: string | null;
};

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";


export function CustomerProfilePanel({
  customer,
  users,
  partners,
  segmentOptions,
}: {
  customer: CustomerProfile;
  users: Option[];
  partners: Option[];
  segmentOptions: SegmentOptions;
}) {
  const m = useMessages();
  const labels = useLabels();
  const locale = useLocale();
  const c = m.customers;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salesUsers = users.filter((u) => u.role === "SALES" || u.role === "ADMIN");
  const presalesUsers = users.filter((u) => u.role === "PRESALES" || u.role === "ADMIN");

  const boundIds = new Set(customer.boundPartners.map((bp) => bp.id));
  const availablePartners = partners.filter((p) => !boundIds.has(p.id));
  const resolvedTier = resolveCustomerTier(customer);
  const pe = m.profileEditor;

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  const mapLabel = (map: Record<string, string>, code: string | null | undefined) =>
    code ? (map[code] ?? code) : "—";

  const fields: [string, string | null][] = [
    [c.colName, customer.name],
    [c.statusLabel, statusLabel(customer.status)],
    [c.salesOwnerLabel, customer.owner?.name ?? null],
    [c.presalesOwnerLabel, customer.presalesUser?.name ?? null],
    [c.satisfactionOwnerLabel, customer.satisfactionUser?.name ?? null],
    [c.customerSegmentLabel, mapLabel(labels.customerSegmentLabels, customer.customerSegment)],
    [m.common.tier, resolvedTier ? formatTierLabel(resolvedTier) : null],
    [c.buyingTriggerLabel, mapLabel(labels.buyingTriggerLabels, customer.buyingTrigger)],
    [c.entryPathLabel, mapLabel(labels.entryPathLabels, customer.entryPath)],
    [c.industryLabel, customer.industry],
    [c.scaleLabel, customer.scale],
    [c.cityPlaceholder, customer.city],
    [c.countryPlaceholder, customer.country],
    [c.websiteLabel, customer.website],
    [c.notesPlaceholder, customer.notes],
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {customer.customerSegment && (
              <Badge tone="blue">{mapLabel(labels.customerSegmentLabels, customer.customerSegment)}</Badge>
            )}
            <TierBadge tier={resolvedTier} />
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <AiAddButton
              scope="customer_profile"
              customerId={customer.id}
              label={c.ai.aiComplete}
              variant="soft"
              seedMessage={profileEnrichSeedMessage(locale, "customer")}
              autoStart
            />
            <button type="button" onClick={() => { setError(null); setOpen(true); }} className="text-xs text-sky-600 hover:underline">
              {c.editProfile}
            </button>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {fields.map(([label, value]) => (
            <div key={label} className={label === c.notesPlaceholder ? "sm:col-span-2" : ""}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className={`mt-0.5 whitespace-pre-wrap ${value && value !== "—" ? "text-slate-800" : "text-slate-300"}`}>
                {value && value !== "—" ? value : m.common.toBeFilled}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-5">
        <Card title={c.boundPartners}>
          {customer.partnerRelation === "SELF" ? (
            <div className="space-y-2">
              {customer.boundPartners.map((bp) => (
                <Link
                  key={bp.id}
                  href={`/partners/${bp.id}`}
                  className="block rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-sm font-medium text-indigo-900 hover:bg-indigo-50"
                >
                  {bp.name}
                  <span className="ml-2 text-[10px] rounded-full bg-indigo-100 px-1.5 py-0.5 text-indigo-700">
                    {c.selfBadge}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {customer.boundPartners.length > 0 ? (
                <div className="space-y-2">
                  {customer.boundPartners.map((bp) => (
                    <div
                      key={bp.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5"
                    >
                      <Link
                        href={`/partners/${bp.id}`}
                        className="text-sm font-medium text-emerald-900 hover:underline min-w-0 truncate"
                      >
                        {bp.name}
                      </Link>
                      <form action={removeCustomerPartnerAction.bind(null, customer.id, bp.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600 shrink-0">{c.unbind}</button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">{c.notBound}</p>
              )}
              {availablePartners.length > 0 && (
                <form action={addCustomerPartnerAction.bind(null, customer.id)} className="space-y-2">
                  <select name="partnerId" defaultValue="" className={input} required>
                    <option value="" disabled>{c.selectPartner}</option>
                    {availablePartners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800">
                    {c.bindPartner}
                  </button>
                </form>
              )}
            </div>
          )}
        </Card>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{c.editProfileTitle.replace("{name}", customer.name)}</h3>
            <form
              action={async (fd) => {
                setSaving(true);
                setError(null);
                try {
                  const result = await updateCustomerAction(customer.id, fd);
                  if (result && "error" in result && result.error) {
                    setError(
                      result.error === "NAME_REQUIRED"
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
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label className="text-sm sm:col-span-2">
                <span className="text-xs text-slate-500">{c.colName}</span>
                <input name="name" defaultValue={customer.name} required className={input} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.statusLabel}</span>
                <select name="status" defaultValue={customer.status} className={input}>
                  <option value="ACTIVE">{c.statusActive}</option>
                  <option value="PROSPECT">{c.statusProspect}</option>
                  <option value="INACTIVE">{c.statusInactive}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.salesOwnerLabel}</span>
                <select name="ownerId" defaultValue={customer.ownerId ?? ""} className={input}>
                  <option value="">—</option>
                  {salesUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.presalesOwnerLabel}</span>
                <select name="presalesUserId" defaultValue={customer.presalesUserId ?? ""} className={input}>
                  <option value="">—</option>
                  {presalesUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.satisfactionOwnerLabel}</span>
                <select name="satisfactionUserId" defaultValue={customer.satisfactionUserId ?? ""} className={input}>
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2 pt-1 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">{c.segmentSection}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TaxonomySelectField
                    dimension="CUSTOMER_SEGMENT"
                    name="customerSegment"
                    value={customer.customerSegment ?? ""}
                    options={segmentOptions.customerSegment}
                  />
                  <label className="text-sm">
                    <span className="text-xs text-slate-500">{m.common.tier}</span>
                    <select name="tier" defaultValue={tierSelectValue(resolvedTier)} className={input}>
                      <option value="">{pe.notTiered}</option>
                      <option value="A">{pe.tierA}</option>
                      <option value="B">{pe.tierB}</option>
                      <option value="C">{pe.tierC}</option>
                    </select>
                  </label>
                  <TaxonomySelectField
                    dimension="BUYING_TRIGGER"
                    name="buyingTrigger"
                    value={customer.buyingTrigger ?? ""}
                    options={segmentOptions.buyingTrigger}
                  />
                  <TaxonomySelectField
                    dimension="ENTRY_PATH"
                    name="entryPath"
                    value={customer.entryPath ?? ""}
                    options={segmentOptions.entryPath}
                  />
                </div>
              </div>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.industryLabel}</span>
                <input name="industry" defaultValue={customer.industry ?? ""} className={input} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.scaleLabel}</span>
                <input name="scale" defaultValue={customer.scale ?? ""} className={input} />
              </label>
              <CountryCityFields
                defaultCountry={customer.country}
                defaultCity={customer.city}
                showLabels
                countryLabelText={c.countryPlaceholder}
                cityLabelText={c.cityPlaceholder}
                inputClassName={input}
                fieldClassName="text-sm"
              />
              <label className="text-sm sm:col-span-2">
                <span className="text-xs text-slate-500">{c.websiteLabel}</span>
                <input name="website" defaultValue={customer.website ?? ""} className={input} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-xs text-slate-500">{c.notesPlaceholder}</span>
                <textarea name="notes" defaultValue={customer.notes ?? ""} rows={3} className={input} />
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                {error && <p className="flex-1 text-xs text-red-600 self-center">{error}</p>}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  {m.common.cancel}
                </button>
                <button disabled={saving} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60">
                  {saving ? m.common.loading : c.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
