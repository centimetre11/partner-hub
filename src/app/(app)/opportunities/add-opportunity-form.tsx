"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createOpportunityFromListAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";
import { OpportunityProcessFields } from "@/components/opportunity-process-fields";

type Option = { id: string; name: string };

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

export function AddOpportunityForm({
  customers,
  partners,
}: {
  customers: Option[];
  partners: Option[];
}) {
  const [open, setOpen] = useState(false);
  const m = useMessages();
  const o = m.opportunities;
  const c = m.customers;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
      >
        {o.add}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{o.addTitle}</h3>
            <form action={createOpportunityFromListAction} className="space-y-3">
              <select name="customerId" required defaultValue="" className={input} aria-label={o.selectCustomer}>
                <option value="" disabled>
                  {o.selectCustomer}
                </option>
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}
                  </option>
                ))}
              </select>
              <input name="name" required placeholder={c.opportunityName} className={input} />
              <input name="amount" placeholder={m.common.amount} className={input} />
              <OpportunityProcessFields />
              <select name="status" defaultValue="P20" className={input} aria-label={m.common.status}>
                <option value="P20">{o.statusP20}</option>
                <option value="P50">{o.statusP50}</option>
                <option value="P80">{o.statusP80}</option>
                <option value="WON">{m.common.won}</option>
                <option value="LOST">{m.common.lost}</option>
                <option value="PAUSED">{m.common.paused}</option>
              </select>
              <input name="followUpAt" type="date" className={input} aria-label={o.followUp} />
              <div className="flex gap-2">
                <select name="dealType" defaultValue="" className={input} aria-label={o.colDealType}>
                  <option value="">{c.dealTypeNone}</option>
                  <option value="PROJECT">{c.dealTypeProject}</option>
                  <option value="PRODUCT">{c.dealTypeProduct}</option>
                </select>
                <select name="partnerId" defaultValue="" className={input} aria-label={o.colPartner}>
                  <option value="">{c.viaPartnerNone}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                name="notes"
                rows={2}
                placeholder={o.notesPlaceholder}
                className={input}
                aria-label={m.common.note}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  {m.common.cancel}
                </button>
                <SubmitButton label={o.add} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
