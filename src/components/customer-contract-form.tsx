"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
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
  type BillingCycleCode,
  type ContractStatusCode,
  type ContractTypeCode,
} from "@/lib/contract-types";
import { AmountInput } from "@/components/amount-input";
import {
  AMOUNT_CURRENCIES,
  currencyForInput,
  formatAmountDisplay,
  normalizeAmountInput,
  type AmountCurrency,
} from "@/lib/amount";
import {
  emptyLineItem,
  lineItemsToFormJson,
  type ContractLineItemInput,
} from "@/lib/contract-line-items";
import { ContractAiExtract } from "@/components/contract-ai-extract";
import type { ContractExtractResult } from "@/lib/contract-extract-types";

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
  productMaintRate: string;
  productMaintRateHint: string;
  productMaintRateCustom: string;
  productMaintIncludedY1: string;
  productMaintBuyoutRule: string;
  productMaintEstimate: string;
  productMaintParent: string;
  productMaintParentNone: string;
  subscriptionNote: string;
  projectMaintRate: string;
  projectMaintRateHint: string;
  projectMaintIncludedY1: string;
  projectMaintRule: string;
  projectMaintEstimate: string;
  projectMaintParent: string;
  projectMaintParentNone: string;
  crmContractId: string;
  crmContractIdPlaceholder: string;
  lineItemsTitle: string;
  lineItemsHint: string;
  lineProduct: string;
  lineVersion: string;
  lineAmount: string;
  lineCycleYears: string;
  lineAdd: string;
  lineRemove: string;
  aiExtractTitle: string;
  aiExtractHint: string;
  aiExtractUpload: string;
  aiExtractPaste: string;
  aiExtractRun: string;
  aiExtractRunning: string;
  aiExtractClear: string;
  aiExtractSuccess: string;
  aiExtractSuccessCompact: string;
  aiExtractAgain: string;
  aiExtractFailed: string;
  aiExtractImageRequired: string;
  aiExtractOrText: string;
  aiExtractTextPlaceholder: string;
  aiExtractGatewayError: string;
  aiExtractTimeout: string;
  amount: string;
  note: string;
  save: string;
  add: string;
  delete: string;
  contractSaving: string;
  contractSaved: string;
  contractCreated: string;
};

type Option = { id: string; name: string };

function ContractSubmitButton({
  mode,
  copy,
}: {
  mode: "create" | "edit";
  copy: Pick<ContractFormCopy, "save" | "add" | "contractSaving">;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? copy.contractSaving : mode === "edit" ? copy.save : copy.add}
    </button>
  );
}

export type ContractFormLineItemDefault = {
  product: string;
  version?: string | null;
  amount?: string | null;
  currency?: string | null;
  cycleYears?: number | null;
};

type ContractDefaults = {
  id?: string;
  name?: string;
  contractType?: string;
  status?: string;
  amount?: string | null;
  currency?: string | null;
  crmContractId?: string | null;
  billingCycle?: string | null;
  startDate?: string;
  endDate?: string;
  renewsAt?: string;
  partnerId?: string | null;
  opportunityId?: string | null;
  projectId?: string | null;
  parentContractId?: string | null;
  productMaintRatePct?: number | null;
  productMaintIncludedY1?: boolean;
  projectMaintRatePct?: number | null;
  projectMaintIncludedY1?: boolean;
  notes?: string | null;
  lineItems?: ContractFormLineItemDefault[];
};

function useRateState(initial: number | null | undefined, fallback = 15) {
  const start = initial ?? fallback;
  const isPreset = MAINT_RATE_PRESETS.includes(start as (typeof MAINT_RATE_PRESETS)[number]);
  const [rateMode, setRateMode] = useState<"15" | "20" | "custom">(
    start === 20 ? "20" : isPreset ? "15" : "custom"
  );
  const [customRate, setCustomRate] = useState(isPreset || initial == null ? "" : String(initial));
  const resolved = rateMode === "custom" ? Number(customRate) || null : Number(rateMode);
  return { rateMode, setRateMode, customRate, setCustomRate, resolved };
}

function isRenewalType(type: ContractTypeCode) {
  return type === "PRODUCT_MAINTENANCE" || type === "PROJECT_MAINTENANCE";
}

function toLineState(
  items: ContractFormLineItemDefault[] | undefined,
  fallbackCurrency: string | null | undefined
): ContractLineItemInput[] {
  if (!items?.length) return [];
  return items.map((it) => ({
    product: it.product ?? "",
    version: it.version ?? null,
    amount: it.amount ?? null,
    currency: it.currency ? currencyForInput(it.currency) : currencyForInput(fallbackCurrency),
    cycleYears: it.cycleYears ?? 1,
  }));
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
  customerNameHint,
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
  /** Helps AI match CRM screenshot to the current customer. */
  customerNameHint?: string | null;
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [contractType, setContractType] = useState<ContractTypeCode>(
    (defaults?.contractType as ContractTypeCode) || "SUBSCRIPTION"
  );
  const [status, setStatus] = useState<ContractStatusCode>(
    (defaults?.status as ContractStatusCode) || "ACTIVE"
  );
  const [amount, setAmount] = useState(defaults?.amount ?? "");
  const [currency, setCurrency] = useState<AmountCurrency>(currencyForInput(defaults?.currency));
  const [crmContractId, setCrmContractId] = useState(defaults?.crmContractId ?? "");
  const [billingCycle, setBillingCycle] = useState(
    defaults?.billingCycle ?? (isRenewalType((defaults?.contractType as ContractTypeCode) || "SUBSCRIPTION") ? "YEARLY" : "")
  );
  const [startDate, setStartDate] = useState(defaults?.startDate ?? "");
  const [endDate, setEndDate] = useState(defaults?.endDate ?? "");
  const [renewsAt, setRenewsAt] = useState(defaults?.renewsAt ?? "");
  const [opportunityId, setOpportunityId] = useState(defaults?.opportunityId ?? "");
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [lineItems, setLineItems] = useState<ContractLineItemInput[]>(() =>
    toLineState(defaults?.lineItems, defaults?.currency)
  );
  const productRate = useRateState(defaults?.productMaintRatePct);
  const projectRate = useRateState(defaults?.projectMaintRatePct);
  const [productMaintIncludedY1, setProductMaintIncludedY1] = useState(
    defaults?.productMaintIncludedY1 ?? true
  );
  const [projectMaintIncludedY1, setProjectMaintIncludedY1] = useState(
    defaults?.projectMaintIncludedY1 ?? true
  );
  const [savedFlash, setSavedFlash] = useState(false);
  const [aiKey, setAiKey] = useState(0);

  const productEstimate =
    contractType === "BUYOUT" && productRate.resolved != null
      ? estimateMaintAmount(amount, productRate.resolved)
      : null;
  const projectEstimate =
    contractType === "PROJECT" && projectRate.resolved != null
      ? estimateMaintAmount(amount, projectRate.resolved)
      : null;

  const showBilling = !isPrimaryCommercialType(contractType);
  const lineItemsJson = useMemo(() => lineItemsToFormJson(lineItems), [lineItems]);

  const updateLine = (index: number, patch: Partial<ContractLineItemInput>) => {
    setLineItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  function applyExtract(result: ContractExtractResult) {
    if (result.name?.trim()) setName(result.name.trim());
    if (result.contractType) {
      setContractType(result.contractType);
      if (isPrimaryCommercialType(result.contractType)) setBillingCycle("");
      else if (result.billingCycle) setBillingCycle(result.billingCycle);
      else if (result.contractType === "SUBSCRIPTION" || isRenewalType(result.contractType)) {
        setBillingCycle("YEARLY");
      }
    } else if (result.billingCycle) {
      setBillingCycle(result.billingCycle);
    }
    if (result.status) setStatus(result.status);
    // Never let CRM IDs / free text land in the amount box.
    const parsedAmount = normalizeAmountInput(result.amount);
    if (parsedAmount != null) setAmount(parsedAmount);
    if (result.currency) setCurrency(result.currency);
    if (result.crmContractId?.trim()) setCrmContractId(result.crmContractId.trim());
    if (result.startDate) setStartDate(result.startDate);
    if (result.endDate) setEndDate(result.endDate);
    if (result.renewsAt) setRenewsAt(result.renewsAt);
    if (result.lineItems?.length) {
      setLineItems(
        result.lineItems.map((it) => ({
          product: it.product,
          version: it.version,
          amount: it.amount,
          currency: it.currency ? currencyForInput(it.currency) : currencyForInput(result.currency),
          cycleYears: it.cycleYears ?? 1,
        }))
      );
    }
    // Match opportunity by name (CRM opportunity name often equals contract name)
    const matchName = result.name?.trim();
    if (matchName) {
      const opp = opportunities.find(
        (o) => o.name.trim().toLowerCase() === matchName.toLowerCase()
      );
      if (opp) setOpportunityId(opp.id);
    }
    const noteBits = [
      result.notes?.trim(),
      result.salesOwnerName?.trim()
        ? locale === "zh"
          ? `CRM 销售：${result.salesOwnerName.trim()}`
          : `CRM sales: ${result.salesOwnerName.trim()}`
        : null,
      result.customerName?.trim() &&
      customerNameHint &&
      result.customerName.trim().toLowerCase() !== customerNameHint.trim().toLowerCase()
        ? locale === "zh"
          ? `截图客户：${result.customerName.trim()}`
          : `Screenshot customer: ${result.customerName.trim()}`
        : null,
    ].filter(Boolean);
    if (noteBits.length) {
      setNotes((prev) => {
        const extra = noteBits.join("\n");
        if (!prev?.trim()) return extra;
        if (prev.includes(extra)) return prev;
        return `${prev.trim()}\n${extra}`;
      });
    }
  }

  async function handleAction(formData: FormData) {
    setSavedFlash(false);
    await action(formData);
    // Create path redirects away; edit stays and needs visible confirmation.
    if (mode === "edit") {
      setSavedFlash(true);
      setAiKey((k) => k + 1);
    }
  }

  return (
    <form action={handleAction} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="lineItems" value={lineItemsJson} />

      <ContractAiExtract
        key={aiKey}
        copy={copy}
        customerNameHint={customerNameHint}
        onExtracted={applyExtract}
      />

      {savedFlash && (
        <p className="col-span-2 md:col-span-3 text-[11px] text-emerald-700">
          {mode === "edit" ? copy.contractSaved : copy.contractCreated}
        </p>
      )}

      <input
        name="name"
        required={mode === "create"}
        value={name}
        onChange={(e) => setName(e.target.value)}
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
        value={status}
        onChange={(e) => setStatus(e.target.value as ContractStatusCode)}
        className={inputClassName}
        aria-label={copy.contractStatus}
      >
        {CONTRACT_STATUS_CODES.map((code) => (
          <option key={code} value={code}>
            {contractStatusLabel(code, locale)}
          </option>
        ))}
      </select>
      <label className="block min-w-0 space-y-1 md:col-span-1">
        <span className="text-[11px] text-slate-500">{copy.amount}</span>
        <AmountInput
          inputClassName={inputClassName}
          amountPlaceholder="0.00"
          amountAriaLabel={copy.amount}
          currencyAriaLabel={locale === "en" ? "Currency" : "币种"}
          locale={locale}
          amount={amount}
          currency={currency}
          onAmountChange={setAmount}
          onCurrencyChange={setCurrency}
        />
      </label>
      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] text-slate-500">{copy.crmContractId}</span>
        <input
          name="crmContractId"
          value={crmContractId}
          onChange={(e) => setCrmContractId(e.target.value)}
          placeholder={copy.crmContractIdPlaceholder}
          className={`${inputClassName} font-mono text-xs`}
          aria-label={copy.crmContractId}
        />
      </label>

      {showBilling ? (
        <label className="block min-w-0 space-y-1">
          <span className="text-[11px] text-slate-500">{copy.contractBillingCycle}</span>
          <select
            name="billingCycle"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value as BillingCycleCode | "")}
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
        </label>
      ) : (
        <input type="hidden" name="billingCycle" value="" />
      )}

      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] text-slate-500">{copy.contractStartDate}</span>
        <input
          name="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={inputClassName}
          aria-label={copy.contractStartDate}
        />
      </label>
      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] text-slate-500">{copy.contractEndDate}</span>
        <input
          name="endDate"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={inputClassName}
          aria-label={copy.contractEndDate}
        />
      </label>
      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] text-slate-500">{copy.contractRenewsAt}</span>
        <input
          name="renewsAt"
          type="date"
          value={renewsAt}
          onChange={(e) => setRenewsAt(e.target.value)}
          className={inputClassName}
          aria-label={copy.contractRenewsAt}
        />
      </label>
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
        value={opportunityId}
        onChange={(e) => setOpportunityId(e.target.value)}
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

      <div className="col-span-2 md:col-span-3 rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-slate-700">{copy.lineItemsTitle}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">{copy.lineItemsHint}</p>
          </div>
          <button
            type="button"
            onClick={() => setLineItems((prev) => [...prev, emptyLineItem(currency)])}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {copy.lineAdd}
          </button>
        </div>
        {lineItems.length > 0 && (
          <div className="space-y-2">
            {lineItems.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded-md border border-slate-100 bg-white p-2"
              >
                <input
                  value={row.product}
                  onChange={(e) => updateLine(index, { product: e.target.value })}
                  placeholder={copy.lineProduct}
                  className={inputClassName}
                  aria-label={copy.lineProduct}
                />
                <input
                  value={row.version ?? ""}
                  onChange={(e) => updateLine(index, { version: e.target.value || null })}
                  placeholder={copy.lineVersion}
                  className={inputClassName}
                  aria-label={copy.lineVersion}
                />
                <input
                  value={row.amount ?? ""}
                  onChange={(e) => updateLine(index, { amount: e.target.value || null })}
                  placeholder={copy.lineAmount}
                  className={inputClassName}
                  aria-label={copy.lineAmount}
                />
                <select
                  value={row.currency ?? currency}
                  onChange={(e) =>
                    updateLine(index, { currency: currencyForInput(e.target.value) })
                  }
                  className={inputClassName}
                  aria-label={locale === "en" ? "Currency" : "币种"}
                >
                  {AMOUNT_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={row.cycleYears ?? ""}
                  onChange={(e) =>
                    updateLine(index, {
                      cycleYears: e.target.value ? Number(e.target.value) || null : null,
                    })
                  }
                  placeholder={copy.lineCycleYears}
                  className={inputClassName}
                  aria-label={copy.lineCycleYears}
                />
                <button
                  type="button"
                  onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== index))}
                  className="text-xs text-slate-400 hover:text-red-600 text-left md:text-center"
                >
                  {copy.lineRemove}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {contractType === "BUYOUT" && (
        <div className="col-span-2 md:col-span-3 rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-3 space-y-2">
          <p className="text-[11px] text-slate-600 leading-relaxed">{copy.productMaintBuyoutRule}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">{copy.productMaintRate}</label>
              <select
                value={productRate.rateMode}
                onChange={(e) => productRate.setRateMode(e.target.value as "15" | "20" | "custom")}
                className={inputClassName}
                aria-label={copy.productMaintRate}
              >
                {MAINT_RATE_PRESETS.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
                <option value="custom">{copy.productMaintRateCustom}</option>
              </select>
              <input type="hidden" name="productMaintRatePct" value={productRate.resolved ?? ""} />
            </div>
            {productRate.rateMode === "custom" && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{copy.productMaintRateCustom}</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={productRate.customRate}
                  onChange={(e) => productRate.setCustomRate(e.target.value)}
                  className={inputClassName}
                  placeholder="15"
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
              <input
                type="checkbox"
                name="productMaintIncludedY1"
                value="true"
                checked={productMaintIncludedY1}
                onChange={(e) => setProductMaintIncludedY1(e.target.checked)}
                className="rounded border-slate-300"
              />
              {copy.productMaintIncludedY1}
            </label>
          </div>
          <p className="text-[11px] text-slate-400">{copy.productMaintRateHint}</p>
          {productEstimate && (
            <p className="text-[11px] text-sky-700">
              {copy.productMaintEstimate
                .replace("{amount}", formatAmountDisplay(productEstimate, currency, locale))
                .replace("{rate}", String(productRate.resolved))}
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
                <option value="custom">{copy.productMaintRateCustom}</option>
              </select>
              <input type="hidden" name="projectMaintRatePct" value={projectRate.resolved ?? ""} />
            </div>
            {projectRate.rateMode === "custom" && (
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">{copy.productMaintRateCustom}</label>
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
                .replace("{amount}", formatAmountDisplay(projectEstimate, currency, locale))
                .replace("{rate}", String(projectRate.resolved))}
            </p>
          )}
        </div>
      )}

      {contractType === "PRODUCT_MAINTENANCE" && (
        <div className="col-span-2 md:col-span-3">
          <label className="block text-[11px] text-slate-500 mb-1">{copy.productMaintParent}</label>
          <select
            name="parentContractId"
            defaultValue={defaults?.parentContractId ?? ""}
            className={inputClassName}
          >
            <option value="">{copy.productMaintParentNone}</option>
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
        <p className="col-span-2 md:col-span-3 text-[11px] text-slate-400">{copy.subscriptionNote}</p>
      )}

      {!isRenewalType(contractType) && <input type="hidden" name="parentContractId" value="" />}
      {contractType !== "BUYOUT" && <input type="hidden" name="productMaintRatePct" value="" />}
      {contractType !== "PROJECT" && <input type="hidden" name="projectMaintRatePct" value="" />}

      <textarea
        name="notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
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
        <ContractSubmitButton mode={mode} copy={copy} />
      </div>
    </form>
  );
}
