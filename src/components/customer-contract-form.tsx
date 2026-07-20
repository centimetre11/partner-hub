"use client";

import { useState } from "react";
import {
  BILLING_CYCLE_CODES,
  CONTRACT_STATUS_CODES,
  CONTRACT_TYPE_CODES,
  MAINT_RATE_PRESETS,
  billingCycleLabel,
  contractStatusLabel,
  contractTypeLabel,
  estimateMaintAmount,
  isPrimaryCommercialType,
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
  projectMaintRate: string;
  projectMaintRateHint: string;
  projectMaintIncludedY1: string;
  projectMaintRule: string;
  projectMaintEstimate: string;
  projectMaintParent: string;
  projectMaintParentNone: string;
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
  projectMaintRatePct?: number | null;
  projectMaintIncludedY1?: boolean;
  notes?: string | null;
};

function useRateState(initial: number | null | undefined, fallback = 15) {
  const start = initial ?? fallback;
  const isPreset = MAINT_RATE_PRESETS.includes(start as (typeof MAINT_RATE_PRESETS)[number]);
  const [rateMode, setRateMode] = useState<"15" | "20" | "custom">(
    start === 20 ? "20" : isPreset ? "15" : "custom"
  );
  const [customRate, setCustomRate] = useState(isPreset || initial == null ? "" : String(initial));
  const resolved =
    rateMode === "custom" ? Number(customRate) || null : Number(rateMode);
  return { rateMode, setRateMode, customRate, setCustomRate, resolved };
}

export function CustomerContractForm({
  action,
  deleteAction,
  defaults,
  partners,
  opportunities,
  projects,
  buyouts,
  projectContracts,
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
  projectContracts: Option[];
  locale: "zh" | "en";
  copy: ContractFormCopy;
  inputClassName: string;
  mode: "create" | "edit";
}) {
  const [contractType, setContractType] = useState<ContractTypeCode>(
    (defaults?.contractType as ContractTypeCode) || "SUBSCRIPTION"
  );
  const [amount, setAmount] = useState(defaults?.amount ?? "");
  const weibaoRate = useRateState(defaults?.weibaoRatePct);
  const projectRate = useRateState(defaults?.projectMaintRatePct);
  const [weibaoIncludedY1, setWeibaoIncludedY1] = useState(defaults?.weibaoIncludedY1 ?? true);
  const [projectMaintIncludedY1, setProjectMaintIncludedY1] = useState(
    defaults?.projectMaintIncludedY1 ?? true
  );

  const weibaoEstimate =
    contractType === "BUYOUT" && weibaoRate.resolved != null
      ? estimateMaintAmount(amount, weibaoRate.resolved)
      : null;
  const projectEstimate =
    contractType === "PROJECT" && projectRate.resolved != null
      ? estimateMaintAmount(amount, projectRate.resolved)
      : null;

  const showBilling = !isPrimaryCommercialType(contractType);
  const yearlyDefault =
    contractType === "MAINTENANCE" || contractType === "PROJECT_MAINTENANCE" ? "YEARLY" : "";

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

      {showBilling ? (
        <select
          name="billingCycle"
          defaultValue={defaults?.billingCycle ?? yearlyDefault}
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
                value={weibaoRate.rateMode}
                onChange={(e) => weibaoRate.setRateMode(e.target.value as "15" | "20" | "custom")}
                className={inputClassName}
                aria-label={copy.weibaoRate}
              >
                {MAINT_RATE_PRESETS.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
                <option value="custom">{copy.weibaoRateCustom}</option>
              </select>
              <input type="hidden" name="weibaoRatePct" value={weibaoRate.resolved ?? ""} />
            </div>
            {weibaoRate.rateMode === "custom" && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{copy.weibaoRateCustom}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={weibaoRate.customRate}
                  onChange={(e) => weibaoRate.setCustomRate(e.target.value)}
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
                checked={weibaoIncludedY1}
                onChange={(e) => setWeibaoIncludedY1(e.target.checked)}
                className="rounded border-slate-300"
              />
              {copy.weibaoIncludedY1}
            </label>
          </div>
          <p className="text-[11px] text-slate-400">{copy.weibaoRateHint}</p>
          {weibaoEstimate && (
            <p className="text-[11px] text-sky-700">
              {copy.weibaoEstimate
                .replace("{amount}", weibaoEstimate)
                .replace("{rate}", String(weibaoRate.resolved))}
            </p>
          )}
        </div>
      )}

      {contractType === "PROJECT" && (
        <div className="col-span-2 md:col-span-3 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-3 space-y-2">
          <p className="text-[11px] text-slate-600 leading-relaxed">{copy.projectMaintRule}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{copy.projectMaintRate}</label>
              <select
                value={projectRate.rateMode}
                onChange={(e) => projectRate.setRateMode(e.target.value as "15" | "20" | "custom")}
                className={inputClassName}
                aria-label={copy.projectMaintRate}
              >
                {MAINT_RATE_PRESETS.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
                <option value="custom">{copy.weibaoRateCustom}</option>
              </select>
              <input type="hidden" name="projectMaintRatePct" value={projectRate.resolved ?? ""} />
            </div>
            {projectRate.rateMode === "custom" && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{copy.weibaoRateCustom}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={projectRate.customRate}
                  onChange={(e) => projectRate.setCustomRate(e.target.value)}
                  className={inputClassName}
                  placeholder="15"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
              <input
                type="checkbox"
                name="projectMaintIncludedY1"
                value="true"
                checked={projectMaintIncludedY1}
                onChange={(e) => setProjectMaintIncludedY1(e.target.checked)}
                className="rounded border-slate-300"
              />
              {copy.projectMaintIncludedY1}
            </label>
          </div>
          <p className="text-[11px] text-slate-400">{copy.projectMaintRateHint}</p>
          {projectEstimate && (
            <p className="text-[11px] text-emerald-700">
              {copy.projectMaintEstimate
                .replace("{amount}", projectEstimate)
                .replace("{rate}", String(projectRate.resolved))}
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

      {contractType === "PROJECT_MAINTENANCE" && (
        <div className="col-span-2 md:col-span-3">
          <label className="block text-[11px] text-slate-500 mb-1">{copy.projectMaintParent}</label>
          <select
            name="parentContractId"
            defaultValue={defaults?.parentContractId ?? ""}
            className={inputClassName}
          >
            <option value="">{copy.projectMaintParentNone}</option>
            {projectContracts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {contractType === "SUBSCRIPTION" && (
        <p className="col-span-2 md:col-span-3 text-[11px] text-slate-400">{copy.weibaoSubscriptionNote}</p>
      )}

      {!isRenewalType(contractType) && <input type="hidden" name="parentContractId" value="" />}
      {contractType !== "BUYOUT" && <input type="hidden" name="weibaoRatePct" value="" />}
      {contractType !== "PROJECT" && <input type="hidden" name="projectMaintRatePct" value="" />}

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

function isRenewalType(type: ContractTypeCode) {
  return type === "MAINTENANCE" || type === "PROJECT_MAINTENANCE";
}
