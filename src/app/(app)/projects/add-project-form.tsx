"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createProjectFromListAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";

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

export function AddProjectForm({
  customers,
  partners,
}: {
  customers: Option[];
  partners: Option[];
}) {
  const [open, setOpen] = useState(false);
  const m = useMessages();
  const p = m.projects;
  const c = m.customers;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
      >
        {p.add}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{p.addTitle}</h3>
            <form action={createProjectFromListAction} className="space-y-3">
              <select name="customerId" required defaultValue="" className={input} aria-label={p.selectCustomer}>
                <option value="" disabled>
                  {p.selectCustomer}
                </option>
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}
                  </option>
                ))}
              </select>
              <input name="name" required placeholder={c.projectName} className={input} />
              <div className="flex gap-2">
                <input name="amount" placeholder={m.common.amount} className={input} />
                <select name="phase" defaultValue="KICKOFF" className={input} aria-label={p.colPhase}>
                  <option value="KICKOFF">{c.phaseKICKOFF}</option>
                  <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
                  <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
                  <option value="GOLIVE">{c.phaseGOLIVE}</option>
                  <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input name="startDate" type="date" className={input} aria-label={c.projectStartDate} />
                <input name="endDate" type="date" className={input} aria-label={c.projectEndDate} />
              </div>
              <select name="partnerId" defaultValue="" className={input} aria-label={p.colPartner}>
                <option value="">{c.deliveryPartnerNone}</option>
                {partners.map((pp) => (
                  <option key={pp.id} value={pp.id}>
                    {pp.name}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  {m.common.cancel}
                </button>
                <SubmitButton label={p.add} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
