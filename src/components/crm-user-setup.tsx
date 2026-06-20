"use client";

import { useState, useTransition } from "react";
import { saveCrmSalesmanMappingAction } from "@/lib/crm-actions";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function CrmUserSetup({
  crmSalesmanName,
  salesmen,
}: {
  crmSalesmanName: string | null;
  salesmen: string[];
}) {
  const crm = useMessages().crm;
  const [selected, setSelected] = useState(crmSalesmanName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("crmSalesmanName", selected);
      const res = await saveCrmSalesmanMappingAction(fd);
      if ("error" in res && typeof res.error === "string") setError(res.error);
      else if ("message" in res && res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-slate-500 leading-relaxed">{crm.userMappingHint}</p>

      {crmSalesmanName ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          {crm.userMapped.replace("{name}", crmSalesmanName)}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          {crm.userNotMapped}
        </div>
      )}

      {salesmen.length > 0 && (
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{crm.selectSalesman}</span>
          <select
            value={salesmen.includes(selected) ? selected : ""}
            onChange={(e) => setSelected(e.target.value)}
            className={input}
          >
            <option value="">{crm.noMapping}</option>
            {salesmen.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{crm.manualSalesman}</span>
        <input
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          placeholder="Fay.Wen"
          className={input}
        />
        <p className="text-xs text-slate-400">{crm.syncFirstHint}</p>
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
      >
        {crm.saveMapping}
      </button>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>}
    </div>
  );
}
