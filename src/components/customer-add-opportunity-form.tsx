"use client";

import { useState } from "react";
import { useMessages, useLocale } from "@/lib/i18n/context";
import { OpportunityProcessFields } from "@/components/opportunity-process-fields";
import { OpportunityStatusWithOutcome } from "@/components/opportunity-outcome-fields";
import { AmountInput } from "@/components/amount-input";
import { CrmImportPicker, type CrmImportResult } from "@/components/crm-import-picker";
import { PendingButton } from "@/components/pending-button";
import { SearchableSelect } from "@/components/searchable-select";
import type { CrmOpportunityDraft } from "@/lib/crm-mcp-map";
import type { OwnerRef } from "@/lib/owner";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";

type Option = { id: string; name: string };

export function CustomerAddOpportunityForm({
  owner,
  action,
  partners,
  defaultPartnerId,
  customerCrmId,
  customerName,
  customerDefaultSegment,
  segmentOptions,
  winFactorOptions,
  lossReasonOptions,
  statusOptions,
}: {
  owner: OwnerRef;
  action: (owner: OwnerRef, formData: FormData) => void | Promise<void>;
  partners: Option[];
  defaultPartnerId?: string;
  customerCrmId?: string | null;
  customerName?: string;
  customerDefaultSegment?: string | null;
  segmentOptions: TaxonomyOptionRow[];
  winFactorOptions: TaxonomyOptionRow[];
  lossReasonOptions: TaxonomyOptionRow[];
  statusOptions: { value: string; label: string }[];
}) {
  const m = useMessages();
  const locale = useLocale();
  const c = m.customers;
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<CrmOpportunityDraft | null>(null);
  const [open, setOpen] = useState(false);

  function onCrmPicked(result: CrmImportResult) {
    if (result.kind !== "opportunity") return;
    setDraft(result.draft);
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  function resetForm() {
    setDraft(null);
    setFormKey((k) => k + 1);
    setOpen(false);
  }

  async function handleAction(formData: FormData) {
    await action(owner, formData);
    resetForm();
  }

  return (
    <details
      className="rounded-lg border border-dashed border-slate-200"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none flex items-center justify-between gap-2">
        <span>{c.addOpportunity}</span>
        <span onClick={(e) => e.stopPropagation()}>
          {customerCrmId?.trim() ? (
            <CrmImportPicker
              kind="opportunity"
              crmCustomerId={customerCrmId}
              customerNameHint={customerName}
              onPicked={onCrmPicked}
              compact
            />
          ) : (
            <span className="text-[11px] text-slate-400 font-normal">{m.crm.importFromCrm.requiresBound}</span>
          )}
        </span>
      </summary>
      {draft?.crmOpportunityId && (
        <p className="px-4 text-[11px] text-sky-700">
          {m.crm.importFromCrm.filledFromCrm}: {draft.crmOpportunityId}
        </p>
      )}
      <form
        key={formKey}
        action={handleAction}
        className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm"
      >
        {draft?.crmOpportunityId && (
          <input type="hidden" name="crmOpportunityId" value={draft.crmOpportunityId} />
        )}
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
        <OpportunityProcessFields key={`proc-${formKey}`} />
        <OpportunityStatusWithOutcome
          key={`st-${formKey}`}
          defaultStatus={draft?.status ?? "P20"}
          segmentOptions={segmentOptions}
          winFactorOptions={winFactorOptions}
          lossReasonOptions={lossReasonOptions}
          customerDefaultSegment={customerDefaultSegment}
          statusOptions={statusOptions}
        />
        <input
          name="followUpAt"
          type="date"
          defaultValue={draft?.followUpAt ?? ""}
          className={input}
        />
        <select name="dealType" defaultValue="" className={input}>
          <option value="">{c.dealTypeNone}</option>
          <option value="PROJECT">{c.dealTypeProject}</option>
          <option value="PRODUCT">{c.dealTypeProduct}</option>
        </select>
        <SearchableSelect
          name="partnerId"
          defaultValue={defaultPartnerId ?? ""}
          emptyLabel={c.viaPartnerNone}
          className={input}
          aria-label={c.viaPartnerNone}
          options={partners.map((p) => ({ value: p.id, label: p.name }))}
        />
        <textarea
          name="notes"
          rows={2}
          defaultValue={draft?.notes ?? ""}
          placeholder={m.opportunities.notesPlaceholder}
          className={`${input} col-span-2 md:col-span-3`}
          aria-label={m.common.note}
        />
        <div className="col-span-2 md:col-span-3 flex justify-end">
          <PendingButton
            label={m.common.add}
            className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-800"
          />
        </div>
      </form>
    </details>
  );
}
