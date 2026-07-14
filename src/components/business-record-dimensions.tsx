"use client";

import { useEffect, useRef } from "react";
import { useLabels, useMessages } from "@/lib/i18n/context";
import { CRM_TRACE_ACTIONS, CRM_TRACE_NATURES } from "@/lib/crm-trace-constants";
import { inferTraceAction, inferTraceNature } from "@/lib/crm-trace-payload";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export type BusinessRecordDimensionValues = {
  traceNature: string;
  traceAction: string;
  contactName: string;
};

export function BusinessRecordDimensions({
  values,
  onChange,
  inferTitle = "",
  inferContent = "",
  compact = false,
}: {
  values: BusinessRecordDimensionValues;
  onChange: (patch: Partial<BusinessRecordDimensionValues>) => void;
  inferTitle?: string;
  inferContent?: string;
  compact?: boolean;
}) {
  const pd = useMessages().partnerDetail;
  const ip = useMessages().intakePanel;
  const labels = useLabels();
  const cls = compact ? `${input} text-xs px-2.5 py-1.5` : input;
  const userEdited = useRef({ nature: false, action: false });

  useEffect(() => {
    userEdited.current = { nature: false, action: false };
  }, [inferTitle, inferContent]);

  useEffect(() => {
    const text = inferContent.trim();
    if (!text) return;
    const patch: Partial<BusinessRecordDimensionValues> = {};
    if (!userEdited.current.nature) {
      const next = inferTraceNature(inferTitle, text, "OTHER");
      if (next !== values.traceNature) patch.traceNature = next;
    }
    if (!userEdited.current.action) {
      const next = inferTraceAction(inferTitle, text, "OTHER");
      if (next !== values.traceAction) patch.traceAction = next;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [inferContent, inferTitle, values.traceNature, values.traceAction, onChange]);

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{ip.traceNatureLabel}</span>
        <select
          value={values.traceNature}
          onChange={(e) => {
            userEdited.current.nature = true;
            onChange({ traceNature: e.target.value });
          }}
          className={cls}
        >
          <option value="">{ip.selectPlaceholder}</option>
          {CRM_TRACE_NATURES.map((n) => (
            <option key={n} value={n}>
              {labels.crmTraceNatureLabels[n] ?? n}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{ip.traceActionLabel}</span>
        <select
          value={values.traceAction}
          onChange={(e) => {
            userEdited.current.action = true;
            onChange({ traceAction: e.target.value });
          }}
          className={cls}
        >
          <option value="">{ip.selectPlaceholder}</option>
          {CRM_TRACE_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {labels.crmTraceActionLabels[a] ?? a}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 sm:col-span-2">
        <span className="text-xs text-slate-500">{pd.businessRecordContactLocal}</span>
        <input
          value={values.contactName}
          onChange={(e) => onChange({ contactName: e.target.value })}
          className={cls}
          placeholder={pd.businessRecordContactLocalPlaceholder}
        />
      </label>
    </div>
  );
}

export function CrmBindingStatus({
  crmCustomerBound,
  crmSalesmanBound,
  crmCustomerName,
}: {
  crmCustomerBound: boolean;
  crmSalesmanBound: boolean;
  crmCustomerName?: string | null;
}) {
  const t = useMessages().todos;

  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span
        className={`rounded-full px-2 py-0.5 ${
          crmCustomerBound ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {crmCustomerBound
          ? t.crmCustomerBound.replace("{name}", crmCustomerName ?? "CRM")
          : t.crmCustomerUnbound}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 ${
          crmSalesmanBound ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}
      >
        {crmSalesmanBound ? t.crmSalesmanBound : t.crmSalesmanUnbound}
      </span>
    </div>
  );
}
