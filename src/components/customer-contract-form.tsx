"use client";

import { useState } from "react";
import {
  BILLING_CYCLE_CODES,
  CONTRACT_STATUS_CODES,
  CONTRACT_TYPE_CODES,
  WEIBAO_RATE_PRESETS,
  billingCycleLabel,
  contractStatusLabel,
  contractTypeLabel,
  estimateWeibaoAmount,
  type ContractTypeCode,
} from "@/lib/contract-types";

export type ContractFormCopy = {
  contractName: string;
  contractType: string;
  contractStatus: string;
  contractBillingCycle: string;
  contractBillingNone: string;
  contractStartDate: string;
  contractEndDate: string;
  contractRenewsAt: string;
  viaPartnerNone: string;
  contractLinkOpportunityNone: string;
  contractLinkProjectNone: string;
  contractNotesPlaceholder: string;
  weibaoRate: string;
  weibaoRateHint: string;
  weibaoRateCustom: string;
  weibaoIncludedY1: string;
  weibaoBuyoutRule: string;
  weibaoEstimate: string;
  weibaoParentBuyout: string;
  weibaoParentNone: string;
  weibaoSubscriptionNote: string;
  amount: string;
  note: string;
  save: string;
  add: string;
  delete: string;
};

type Option = { id: string; name: string };

type ContractDefaults = {
  id?: string;
  name?: string;
  contractType?: string;
  status?: string;
  amount?: string | null;
  billingCycle?: string | null;
  startDate?: string;
  endDate?: string;
  renewsAt?: string;
  partnerId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
  parentContractId?: string | null;
  weibaoRatePct?: number | null;
  weibaoIncludedY1?: boolean;
  notes?: string | null;
};

export function CustomerContractForm({
  action,
  deleteAction,
  defaults,
  partners,
  opportunities,
  projects,
  buyouts,
  locale,
  copy,
  inputClassName,
  mode,
}: {
  action: (formData: FormData) => void | Promise<void>;
  deleteAction?: (formData: FormData) => void | Promise<void>;
  defaults?: ContractDefaults;
  partners: Option[];
  opportunities: Option[];
  projects: Option[];
  buyouts: Option[];
  locale: "zh" | "en";
  copy: ContractFormCopy;
  inputClassName: string;
  mode: "create" | "edit";
}) {
  const [contractType, setContractType] = useState<ContractTypeCode>(
    (defaults?.contractType as ContractTypeCode) || "SUBSCRIPTION"
  );
  const [amount, setAmount] = useState(defaults?.amount ?? "");
  const initialRate = defaults?.weibaoRatePct ?? 15;
  const isPreset = WEIBAO_RATE_PRESETS.includes(initialRate as (typeof WEIBAO_RATE_PRESETS)[number]);
  const [rateMode, setRateMode] = useState<"15" | "20" | "custom">(
    initialRate === 20 ? "20" : isPreset ? "15" : "custom"
  );
  const [customRate, setCustomRate] = useState(
    isPreset || defaults?.weibaoRatePct == null ? "" : String(defaults.weibaoRatePct)
  );
  const [includedY1, setIncludedY1] = useState(defaults?.weibaoIncludedY1 ?? true);

  const resolvedRate =
    contractType === "BUYOUT"
      ? rateMode === "custom"
        ? Number(customRate) || null
        : Number(rateMode)
      : null;
  const estimate =
    contractType === "BUYOUT" && resolvedRate != null
      ? estimateWeibaoAmount(amount, resolvedRate)
      : null;

  return (
    <form action={action} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}
      <input
        name="name"
        required={mode === "create"}
        defaultValue={defaults?.name ?? ""}
        placeholder={copy.contractName}
        className={inputClassName}
        aria-label={copy.contractName}
      />
      <select
        name="contractType"
        value={contractType}
        onChange={(e) => setContractType(e.target.value as ContractTypeCode)}
        className={inputClassName}
        aria-label={copy.contractType}
      >
        {CONTRACT_TYPE_CODES.map((code) => (
          <option key={code} value={code}>
            {contractTypeLabel(code, locale)}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={defaults?.status ?? "ACTIVE"}
        className={inputClassName}
        aria-label={copy.contractStatus}
      >
        {CONTRACT_STATUS_CODES.map((code) => (
          <option key={code} value={code}>
            {contractStatusLabel(code, locale)}
          </option>
        ))}
      </select>
      <input
        name="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={copy.amount}
        className={inputClassName}
      />

      {contractType !== "BUYOUT" ? (
        <select
          name="billingCycle"
          defaultValue={defaults?.billingCycle ?? (contractType === "MAINTENANCE" ? "YEARLY" : "")}
          className={inputClassName}
          aria-label={copy.contractBillingCycle}
        >
          <option value="">{copy.contractBillingNone}</option>
          {BILLING_CYCLE_CODES.map((code) => (
            <option key={code} value={code}>
              {billingCycleLabel(code, locale)}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="billingCycle" value="" />
      )}

      <input
        name="startDate"
        type="date"
        defaultValue={defaults?.startDate ?? ""}
        className={inputClassName}
        aria-label={copy.contractStartDate}
      />
      <input
        name="endDate"
        type="date"
        defaultValue={defaults?.endDate ?? ""}
        className={inputClassName}
        aria-label={copy.contractEndDate}
      />
      <input
        name="renewsAt"
        type="date"
        defaultValue={defaults?.renewsAt ?? ""}
        className={inputClassName}
        aria-label={copy.contractRenewsAt}
      />
      <select name="partnerId" defaultValue={defaults?.partnerId ?? ""} className={inputClassName}>
        <option value="">{copy.viaPartnerNone}</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        name="opportunityId"
        defaultValue={defaults?.opportunityId ?? ""}
        className={inputClassName}
      >
        <option value="">{copy.contractLinkOpportunityNone}</option>
        {opportunities.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <select name="projectId" defaultValue={defaults?.projectId ?? ""} className={inputClassName}>
        <option value="">{copy.contractLinkProjectNone}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {contractType === "BUYOUT" && (
        <div className="col-span-2 md:col-span-3 rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-3 space-y-2">
          <p className="text-[11px] text-slate-600 leading-relaxed">{copy.weibaoBuyoutRule}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{copy.weibaoRate}</label>
              <select
                value={rateMode}
                onChange={(e) => setRateMode(e.target.value as "15" | "20" | "custom")}
                className={inputClassName}
                aria-label={copy.weibaoRate}
              >
                {WEIBAO_RATE_PRESETS.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
                <option value="custom">{copy.weibaoRateCustom}</option>
              </select>
              <input type="hidden" name="weibaoRatePct" value={resolvedRate ?? ""} />
            </div>
            {rateMode === "custom" && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{copy.weibaoRateCustom}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  className={inputClassName}
                  placeholder="15"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
              <input
                type="checkbox"
                name="weibaoIncludedY1"
                value="true"
                checked={includedY1}
                onChange={(e) => setIncludedY1(e.target.checked)}
                className="rounded border-slate-300"
              />
              {copy.weibaoIncludedY1}
            </label>
          </div>
          <p className="text-[11px] text-slate-400">{copy.weibaoRateHint}</p>
          {estimate && (
            <p className="text-[11px] text-sky-700">
              {copy.weibaoEstimate.replace("{amount}", estimate).replace("{rate}", String(resolvedRate))}
            </p>
          )}
        </div>
      )}

      {contractType === "MAINTENANCE" && (
        <div className="col-span-2 md:col-span-3">
          <label className="block text-[11px] text-slate-500 mb-1">{copy.weibaoParentBuyout}</label>
          <select
            name="parentContractId"
            defaultValue={defaults?.parentContractId ?? ""}
            className={inputClassName}
          >
            <option value="">{copy.weibaoParentNone}</option>
            {buyouts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {contractType === "SUBSCRIPTION" && (
        <p className="col-span-2 md:col-span-3 text-[11px] text-slate-400">{copy.weibaoSubscriptionNote}</p>
      )}

      {(contractType === "SUBSCRIPTION" || contractType === "BUYOUT") && (
        <input type="hidden" name="parentContractId" value="" />
      )}

      <textarea
        name="notes"
        rows={2}
        defaultValue={defaults?.notes ?? ""}
        placeholder={copy.contractNotesPlaceholder}
        className={`${inputClassName} col-span-2 md:col-span-3`}
        aria-label={copy.note}
      />
      <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
        {mode === "edit" && deleteAction && (
          <button formAction={deleteAction} className="text-xs text-slate-400 hover:text-red-600">
            {copy.delete}
          </button>
        )}
        <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">
          {mode === "edit" ? copy.save : copy.add}
        </button>
      </div>
    </form>
  );
}
