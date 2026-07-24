"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createCustomerAction } from "@/lib/customer-actions";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import { TaxonomySelectField } from "@/components/taxonomy-fields";
import { CountryCityFields } from "@/components/country-city-fields";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { useMessages } from "@/lib/i18n/context";
import { SearchableSelect } from "@/components/searchable-select";
import { PARTNER_TIERS } from "@/lib/tier";

type Option = { id: string; name: string; role?: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

export function AddCustomerForm({
  partners,
  users,
  defaultPartnerId,
  defaultOpen = false,
  segmentOptions,
}: {
  partners: Option[];
  users: Option[];
  defaultPartnerId?: string;
  defaultOpen?: boolean;
  segmentOptions?: {
    customerSegment: TaxonomyOptionRow[];
    buyingTrigger: TaxonomyOptionRow[];
    entryPath: TaxonomyOptionRow[];
  };
}) {
  const [open, setOpen] = useState(defaultOpen);
  const messages = useMessages();
  const c = messages.customers;
  const pe = messages.profileEditor;
  const p = messages.pool;
  const cancelLabel = messages.common.cancel;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
  const salesUsers = users.filter((u) => u.role === "SALES" || u.role === "ADMIN");
  const presalesUsers = users.filter((u) => u.role === "PRESALES" || u.role === "ADMIN");

  return (
    <>
      <div className="flex gap-2">
        <CustomerAiIntakeButton variant="primary" label={p.aiIntake} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {p.addManually}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{c.addTitle}</h3>
            <form action={createCustomerAction} className="space-y-3">
              <input type="hidden" name="redirectTo" value="detail" />
              <input name="name" required placeholder={c.namePlaceholder} className={input} />
              <div className="flex gap-2">
                <input name="industry" placeholder={c.industryPlaceholder} className={input} />
                <select name="status" defaultValue="PROSPECT" className={input} aria-label={c.statusLabel}>
                  <option value="PROSPECT">{c.statusProspect}</option>
                  <option value="ACTIVE">{c.statusActive}</option>
                  <option value="INACTIVE">{c.statusInactive}</option>
                </select>
              </div>
              <CountryCityFields inputClassName={input} />
              {segmentOptions && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TaxonomySelectField dimension="CUSTOMER_SEGMENT" name="customerSegment" value="" options={segmentOptions.customerSegment} />
                  <label className="text-sm">
                    <span className="text-xs text-slate-500">{messages.common.tier}</span>
                    <select name="tier" defaultValue="" className={input}>
                      <option value="">{pe.notTiered}</option>
                      {PARTNER_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t === "A" ? pe.tierA : t === "B" ? pe.tierB : pe.tierC}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <input name="website" placeholder={c.websitePlaceholder} className={input} />
              <input name="scale" placeholder={c.scalePlaceholder} className={input} />
              <div className="flex gap-2">
                <SearchableSelect
                  name="partnerId"
                  defaultValue={defaultPartnerId ?? ""}
                  emptyLabel={c.noPartner}
                  className={input}
                  aria-label={c.partnerLabel}
                  options={partners.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select name="ownerId" defaultValue="" className={input} aria-label={c.salesOwnerLabel}>
                  <option value="">{c.salesOwnerLabel}</option>
                  {salesUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select name="presalesUserId" defaultValue="" className={input} aria-label={c.presalesOwnerLabel}>
                  <option value="">{c.presalesOwnerLabel}</option>
                  {presalesUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select name="satisfactionUserId" defaultValue="" className={input} aria-label={c.satisfactionOwnerLabel}>
                  <option value="">{c.satisfactionOwnerLabel}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <textarea name="notes" placeholder={c.notesPlaceholder} rows={2} className={input} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  {cancelLabel}
                </button>
                <SubmitButton label={c.add} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
