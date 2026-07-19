"use client";

import { useState } from "react";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

type OutcomeProps = {
  defaultCustomerSegment?: string | null;
  defaultWinFactor?: string | null;
  defaultLossReason?: string | null;
  segmentOptions: TaxonomyOptionRow[];
  winFactorOptions: TaxonomyOptionRow[];
  lossReasonOptions: TaxonomyOptionRow[];
  customerDefaultSegment?: string | null;
};

/** Wraps status select + win/loss outcome fields with shared client state */
export function OpportunityStatusWithOutcome({
  defaultStatus,
  defaultCustomerSegment,
  defaultWinFactor,
  defaultLossReason,
  segmentOptions,
  winFactorOptions,
  lossReasonOptions,
  customerDefaultSegment,
  statusOptions,
}: OutcomeProps & {
  defaultStatus: string;
  statusOptions: { value: string; label: string }[];
}) {
  const [status, setStatus] = useState(defaultStatus);

  return (
    <>
      <select
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className={input}
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <OpportunityOutcomePanel
        status={status}
        defaultCustomerSegment={defaultCustomerSegment}
        defaultWinFactor={defaultWinFactor}
        defaultLossReason={defaultLossReason}
        segmentOptions={segmentOptions}
        winFactorOptions={winFactorOptions}
        lossReasonOptions={lossReasonOptions}
        customerDefaultSegment={customerDefaultSegment}
      />
    </>
  );
}

export function OpportunityOutcomePanel({
  status,
  defaultCustomerSegment,
  defaultWinFactor,
  defaultLossReason,
  segmentOptions,
  winFactorOptions,
  lossReasonOptions,
  customerDefaultSegment,
}: OutcomeProps & { status: string }) {
  const m = useMessages();
  const o = m.opportunities;
  const showOutcome = status === "WON" || status === "LOST";
  if (!showOutcome) return null;
  const segmentDefault = defaultCustomerSegment ?? customerDefaultSegment ?? "";

  return (
    <div className="col-span-2 md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <p className="sm:col-span-2 text-xs font-medium text-slate-600">{o.outcomeReviewTitle}</p>
      <label className="text-sm space-y-1">
        <span className="text-xs text-slate-500">{o.outcomeSegmentLabel}</span>
        <select name="customerSegment" defaultValue={segmentDefault} className={input}>
          <option value="">{m.common.select}</option>
          {segmentOptions.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {status === "WON" ? (
        <label className="text-sm space-y-1">
          <span className="text-xs text-slate-500">{o.winFactorLabel}</span>
          <select name="winFactor" defaultValue={defaultWinFactor ?? ""} className={input}>
            <option value="">{m.common.select}</option>
            {winFactorOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="text-sm space-y-1">
          <span className="text-xs text-slate-500">{o.lossReasonLabel}</span>
          <select name="lossReason" defaultValue={defaultLossReason ?? ""} className={input}>
            <option value="">{m.common.select}</option>
            {lossReasonOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
