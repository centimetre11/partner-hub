"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createOpportunityFromListAction } from "@/lib/actions";
import { useMessages, useLocale } from "@/lib/i18n/context";
import { OpportunityProcessFields } from "@/components/opportunity-process-fields";
import { AmountInput } from "@/components/amount-input";
import { CrmImportPicker, type CrmImportResult } from "@/components/crm-import-picker";
import type { CrmOpportunityDraft } from "@/lib/crm-mcp-map";

type Option = { id: string; name: string; crmCustomerId?: string | null };

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
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<CrmOpportunityDraft | null>(null);
  const [customerId, setCustomerId] = useState("");
  const m = useMessages();
  const locale = useLocale();
  const o = m.opportunities;
  const c = m.customers;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  const selectedCrmId = customers.find((cust) => cust.id === customerId)?.crmCustomerId?.trim() || "";
  const selectedCustomer = customers.find((cust) => cust.id === customerId);

  function onCrmPicked(result: CrmImportResult) {
    if (result.kind !== "opportunity") return;
    setDraft(result.draft);
    if (result.localCustomerId) setCustomerId(result.localCustomerId);
    else if (result.draft.crmCustomerId) {
      const match = customers.find((cust) => cust.crmCustomerId === result.draft.crmCustomerId);
      if (match) setCustomerId(match.id);
    }
    setFormKey((k) => k + 1);
  }

  function close() {
    setOpen(false);
    setDraft(null);
    setCustomerId("");
    setFormKey((k) => k + 1);
  }

  async function handleAction(formData: FormData) {
    await createOpportunityFromListAction(formData);
    close();
  }

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="text-base font-semibold">{o.addTitle}</h3>
              {selectedCrmId ? (
                <CrmImportPicker
                  kind="opportunity"
                  crmCustomerId={selectedCrmId}
                  customerNameHint={selectedCustomer?.name}
                  onPicked={onCrmPicked}
                  compact
                />
              ) : customerId ? (
                <span className="text-[11px] text-slate-400">{m.crm.importFromCrm.requiresBound}</span>
              ) : null}
            </div>
            {draft?.crmOpportunityId && (
              <p className="text-[11px] text-sky-700 mb-3">
                {m.crm.importFromCrm.filledFromCrm}: {draft.crmOpportunityId}
              </p>
            )}
            <form key={formKey} action={handleAction} className="space-y-3">
              {draft?.crmOpportunityId && (
                <input type="hidden" name="crmOpportunityId" value={draft.crmOpportunityId} />
              )}
              <select
                name="customerId"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className={input}
                aria-label={o.selectCustomer}
              >
                <option value="" disabled>
                  {o.selectCustomer}
                </option>
                {customers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}
                  </option>
                ))}
              </select>
              <input
                name="name"
                required
                defaultValue={draft?.name ?? ""}
                placeholder={c.opportunityName}
                className={input}
              />
              <AmountInput
                key={`amt-${formKey}`}
                inputClassName={input}
                amountPlaceholder={m.common.amount}
                amountAriaLabel={m.common.amount}
                currencyAriaLabel={m.common.currency}
                locale={locale}
                defaultAmount={draft?.amount || null}
                defaultCurrency={draft?.currency || null}
              />
              <OpportunityProcessFields />
              <select
                name="status"
                defaultValue={draft?.status ?? "P20"}
                className={input}
                aria-label={m.common.status}
              >
                <option value="P20">{o.statusP20}</option>
                <option value="P50">{o.statusP50}</option>
                <option value="P80">{o.statusP80}</option>
                <option value="WON">{m.common.won}</option>
                <option value="LOST">{m.common.lost}</option>
                <option value="PAUSED">{m.common.paused}</option>
              </select>
              <input
                name="followUpAt"
                type="date"
                defaultValue={draft?.followUpAt ?? ""}
                className={input}
                aria-label={o.followUp}
              />
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
                defaultValue={draft?.notes ?? ""}
                placeholder={o.notesPlaceholder}
                className={input}
                aria-label={m.common.note}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
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
