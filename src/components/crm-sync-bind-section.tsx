"use client";

import { useState, useTransition } from "react";
import { useMessages } from "@/lib/i18n/context";
import {
  triggerCrmSyncForBindAction,
  type CrmSyncForBindCustomer,
} from "@/lib/crm-actions";
import type { CrmCustomerOption } from "@/components/crm-customer-picker";

function formatMeta(c: CrmSyncForBindCustomer) {
  const parts: string[] = [];
  if (c.city) parts.push(c.city);
  if (c.status) parts.push(c.status);
  if (c.salesman) parts.push(c.salesman);
  if (c.presales) parts.push(c.presales);
  return parts.join(" · ");
}

export function CrmSyncBindSection({
  entityName,
  selectedId,
  onSelect,
  compact,
}: {
  entityName: string;
  selectedId?: string;
  onSelect: (id: string, customer: CrmCustomerOption) => void;
  /** 已绑定时弱化列表展示 */
  compact?: boolean;
}) {
  const intg = useMessages().integrations;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCustomers, setNewCustomers] = useState<CrmSyncForBindCustomer[] | null>(null);

  function syncNow() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      setNewCustomers(null);
      const res = await triggerCrmSyncForBindAction({ entityName });
      if (!res.ok) {
        setError(res.error || intg.crmSyncFailed);
        return;
      }
      setMessage(res.message);
      setNewCustomers(res.newCustomers);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={syncNow}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          {pending ? intg.crmSyncing : intg.crmSyncNow}
        </button>
        <span className="text-[11px] text-slate-500 leading-snug">{intg.crmSyncBindHint}</span>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>
      )}
      {message && !error && (
        <p className="text-xs text-emerald-700">{message}</p>
      )}

      {newCustomers && newCustomers.length === 0 && (
        <p className="text-xs text-slate-500">{intg.crmSyncNoNew}</p>
      )}

      {newCustomers && newCustomers.length > 0 && !compact && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-600">{intg.crmSyncNewTitle}</div>
          <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
            {newCustomers.map((c) => {
              const selected = selectedId === c.id;
              const meta = formatMeta(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(c.id, {
                        id: c.id,
                        name: c.name,
                        city: c.city,
                        status: c.status,
                        salesman: c.salesman,
                        presales: c.presales,
                      })
                    }
                    className={
                      selected
                        ? "w-full px-2.5 py-2 text-left bg-sky-50"
                        : "w-full px-2.5 py-2 text-left hover:bg-slate-50"
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 truncate">{c.name}</div>
                        {meta ? (
                          <div className="text-[11px] text-slate-500 truncate">{meta}</div>
                        ) : null}
                        <div className="text-[10px] text-slate-400 font-mono truncate">{c.id}</div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5">
                        {c.likelyMatch && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                            {intg.crmSyncLikelyMatch}
                          </span>
                        )}
                        <span className="text-[10px] text-sky-700">
                          {selected ? intg.crmSyncSelected : intg.crmSyncClickBind}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-slate-500">{intg.crmSyncSaveHint}</p>
        </div>
      )}

      {newCustomers && newCustomers.length > 0 && compact && (
        <p className="text-[11px] text-slate-500">
          {intg.crmSyncNewCompact.replace("{count}", String(newCustomers.length))}
        </p>
      )}
    </div>
  );
}
