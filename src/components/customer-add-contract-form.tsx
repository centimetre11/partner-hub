"use client";

import { useState } from "react";
import { useMessages } from "@/lib/i18n/context";
import {
  CustomerContractForm,
  type ContractFormCopy,
} from "@/components/customer-contract-form";
import { CrmImportPicker, type CrmImportResult } from "@/components/crm-import-picker";
import type { CrmContractDraft } from "@/lib/crm-mcp-map";
import type { OwnerRef } from "@/lib/owner";

type Option = { id: string; name: string };

export function CustomerAddContractForm({
  owner,
  action,
  partners,
  opportunities,
  projects,
  buyouts,
  projectContracts,
  locale,
  copy,
  inputClassName,
  customerName,
  customerCrmId,
  defaultPartnerId,
}: {
  owner: OwnerRef;
  action: (owner: OwnerRef, formData: FormData) => void | Promise<void>;
  partners: Option[];
  opportunities: Option[];
  projects: Option[];
  buyouts: Option[];
  projectContracts: Option[];
  locale: "zh" | "en";
  copy: ContractFormCopy;
  inputClassName: string;
  customerName?: string;
  customerCrmId?: string | null;
  defaultPartnerId?: string;
}) {
  const m = useMessages();
  const c = m.customers;
  const [formKey, setFormKey] = useState(0);
  const [draft, setDraft] = useState<CrmContractDraft | null>(null);
  const [open, setOpen] = useState(false);

  function onCrmPicked(result: CrmImportResult) {
    if (result.kind !== "contract") return;
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
        <span>{c.addContract}</span>
        <span onClick={(e) => e.stopPropagation()}>
          {customerCrmId?.trim() ? (
            <CrmImportPicker
              kind="contract"
              crmCustomerId={customerCrmId}
              customerNameHint={customerName}
              onPicked={onCrmPicked}
              compact
            />
          ) : (
            <span className="text-[11px] text-slate-400 font-normal">
              {m.crm.importFromCrm.requiresBound}
            </span>
          )}
        </span>
      </summary>
      {draft?.crmContractId && (
        <p className="px-4 text-[11px] text-sky-700">
          {m.crm.importFromCrm.filledFromCrm}: {draft.crmContractId}
        </p>
      )}
      <div className="px-4 pb-4">
        <CustomerContractForm
          key={formKey}
          action={handleAction}
          mode="create"
          locale={locale}
          copy={copy}
          inputClassName={inputClassName}
          customerNameHint={customerName}
          crmCustomerId={customerCrmId}
          hideCrmImport
          partners={partners}
          opportunities={opportunities}
          projects={projects}
          buyouts={buyouts}
          projectContracts={projectContracts}
          defaults={{
            partnerId: defaultPartnerId ?? "",
            productMaintIncludedY1: true,
            productMaintRatePct: 15,
            projectMaintIncludedY1: true,
            projectMaintRatePct: 15,
            ...(draft
              ? {
                  name: draft.name,
                  contractType: draft.contractType || undefined,
                  status: draft.status,
                  amount: draft.amount || null,
                  currency: draft.currency || null,
                  crmContractId: draft.crmContractId,
                  billingCycle: draft.billingCycle || null,
                  startDate: draft.startDate,
                  endDate: draft.endDate,
                  renewsAt: draft.renewsAt,
                  notes: draft.notes || null,
                }
              : {}),
          }}
        />
      </div>
    </details>
  );
}
