"use client";

import { useState } from "react";
import { useMessages, useLocale } from "@/lib/i18n/context";
import { AmountInput } from "@/components/amount-input";
import { CrmImportPicker, type CrmImportResult } from "@/components/crm-import-picker";
import type { CrmProjectDraft } from "@/lib/crm-mcp-map";
import type { OwnerRef } from "@/lib/owner";

type Option = { id: string; name: string };

export function CustomerAddProjectForm({
  owner,
  action,
  partners,
  defaultPartnerId,
  customerCrmId,
  customerName,
}: {
  owner: OwnerRef;
  action: (owner: OwnerRef, formData: FormData) => void | Promise<void>;
  partners: Option[];
  defaultPartnerId?: string;
  customerCrmId?: string | null;
  customerName?: string;
}) {
  const m = useMessages();
  const locale = useLocale();
  const c = m.customers;
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<CrmProjectDraft | null>(null);

  function onCrmPicked(result: CrmImportResult) {
    if (result.kind !== "project") return;
    setDraft(result.draft);
    setFormKey((k) => k + 1);
  }

  return (
    <details className="rounded-lg border border-dashed border-slate-200">
      <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none flex items-center justify-between gap-2">
        <span>{c.addProject}</span>
        <span onClick={(e) => e.stopPropagation()}>
          {customerCrmId?.trim() ? (
            <CrmImportPicker
              kind="project"
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
      {draft?.crmProjectId && (
        <p className="px-4 text-[11px] text-sky-700">
          {m.crm.importFromCrm.filledFromCrm}: {draft.crmPrjNumber || draft.crmProjectId}
        </p>
      )}
      <form
        key={formKey}
        action={action.bind(null, owner)}
        className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm"
      >
        {draft?.crmProjectId && (
          <input type="hidden" name="crmProjectId" value={draft.crmProjectId} />
        )}
        {draft?.crmPrjNumber && (
          <input type="hidden" name="crmPrjNumber" value={draft.crmPrjNumber} />
        )}
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
        <select name="phase" defaultValue={draft?.phase ?? "KICKOFF"} className={input}>
          <option value="KICKOFF">{c.phaseKICKOFF}</option>
          <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
          <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
          <option value="GOLIVE">{c.phaseGOLIVE}</option>
          <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
        </select>
        <input
          name="startDate"
          type="date"
          defaultValue={draft?.startDate ?? ""}
          className={input}
          placeholder={c.projectStartDate}
        />
        <input
          name="endDate"
          type="date"
          defaultValue={draft?.endDate ?? ""}
          className={input}
          placeholder={c.projectEndDate}
        />
        <select name="partnerId" defaultValue={defaultPartnerId ?? ""} className={input}>
          <option value="">{c.deliveryPartnerNone}</option>
          {partners.map((pp) => (
            <option key={pp.id} value={pp.id}>
              {pp.name}
            </option>
          ))}
        </select>
        {draft?.notes ? (
          <textarea
            name="notes"
            rows={2}
            defaultValue={draft.notes}
            className={`${input} col-span-2 md:col-span-3`}
            aria-label={m.common.note}
          />
        ) : null}
        <div className="col-span-2 md:col-span-3 flex justify-end">
          <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
        </div>
      </form>
    </details>
  );
}
