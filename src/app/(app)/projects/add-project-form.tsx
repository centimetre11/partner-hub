"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createProjectFromListAction } from "@/lib/actions";
import { useMessages, useLocale } from "@/lib/i18n/context";
import { AmountInput } from "@/components/amount-input";
import { CrmImportPicker, type CrmImportResult } from "@/components/crm-import-picker";
import { SearchableSelect } from "@/components/searchable-select";
import type { CrmProjectDraft } from "@/lib/crm-mcp-map";

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

export function AddProjectForm({
  customers,
  partners,
}: {
  customers: Option[];
  partners: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<CrmProjectDraft | null>(null);
  const [customerId, setCustomerId] = useState("");
  const m = useMessages();
  const locale = useLocale();
  const p = m.projects;
  const c = m.customers;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  const selectedCrmId = customers.find((cust) => cust.id === customerId)?.crmCustomerId?.trim() || "";
  const selectedCustomer = customers.find((cust) => cust.id === customerId);

  function onCrmPicked(result: CrmImportResult) {
    if (result.kind !== "project") return;
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
    await createProjectFromListAction(formData);
    close();
  }

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={close}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="text-base font-semibold">{p.addTitle}</h3>
              {selectedCrmId ? (
                <CrmImportPicker
                  kind="project"
                  crmCustomerId={selectedCrmId}
                  customerNameHint={selectedCustomer?.name}
                  onPicked={onCrmPicked}
                  compact
                />
              ) : customerId ? (
                <span className="text-[11px] text-slate-400">{m.crm.importFromCrm.requiresBound}</span>
              ) : null}
            </div>
            {draft?.crmProjectId && (
              <p className="text-[11px] text-sky-700 mb-3">
                {m.crm.importFromCrm.filledFromCrm}: {draft.crmPrjNumber || draft.crmProjectId}
              </p>
            )}
            <form key={formKey} action={handleAction} className="space-y-3">
              {draft?.crmProjectId && (
                <input type="hidden" name="crmProjectId" value={draft.crmProjectId} />
              )}
              {draft?.crmPrjNumber && (
                <input type="hidden" name="crmPrjNumber" value={draft.crmPrjNumber} />
              )}
              <SearchableSelect
                name="customerId"
                value={customerId}
                onChange={setCustomerId}
                placeholder={p.selectCustomer}
                className={input}
                aria-label={p.selectCustomer}
                options={customers.map((cust) => ({ value: cust.id, label: cust.name }))}
              />
              <input
                name="name"
                required
                defaultValue={draft?.name ?? ""}
                placeholder={c.projectName}
                className={input}
              />
              <AmountInput
                key={`amt-${formKey}`}
                inputClassName={input}
                amountPlaceholder={m.common.amount}
                amountAriaLabel={m.common.amount}
                currencyAriaLabel={m.common.currency}
                locale={locale}
              />
              <select
                name="phase"
                defaultValue={draft?.phase ?? "KICKOFF"}
                className={input}
                aria-label={p.colPhase}
              >
                <option value="KICKOFF">{c.phaseKICKOFF}</option>
                <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
                <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
                <option value="GOLIVE">{c.phaseGOLIVE}</option>
                <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
              </select>
              <div className="flex gap-2">
                <input
                  name="startDate"
                  type="date"
                  defaultValue={draft?.startDate ?? ""}
                  className={input}
                  aria-label={c.projectStartDate}
                />
                <input
                  name="endDate"
                  type="date"
                  defaultValue={draft?.endDate ?? ""}
                  className={input}
                  aria-label={c.projectEndDate}
                />
              </div>
              <SearchableSelect
                name="partnerId"
                defaultValue=""
                emptyLabel={c.deliveryPartnerNone}
                className={input}
                aria-label={p.colPartner}
                options={partners.map((pp) => ({ value: pp.id, label: pp.name }))}
              />
              {draft?.notes ? (
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={draft.notes}
                  className={input}
                  aria-label={m.common.note}
                />
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
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
