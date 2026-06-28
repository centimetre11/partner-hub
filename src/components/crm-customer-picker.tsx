"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import {
  suggestCrmCustomersForPartnerAction,
  suggestCrmCustomersForCustomerAction,
  type CrmCustomerSuggestion,
} from "@/lib/crm-actions";
import { buildCrmCustomerViewUrl } from "@/lib/crm";

export type CrmCustomerOption = {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
  salesman: string | null;
  presales?: string | null;
};

function formatCrmMeta(c: Pick<CrmCustomerOption, "city" | "status" | "salesman" | "presales">) {
  const parts: string[] = [];
  if (c.city) parts.push(c.city);
  if (c.status) parts.push(c.status);
  if (c.salesman) parts.push(c.salesman);
  if (c.presales) parts.push(c.presales);
  return parts.join(" · ");
}

export function CrmCustomerPicker({
  value,
  onChange,
  partnerId,
  partnerName,
  customerId,
  customerName,
  matchedCustomer,
}: {
  value: string;
  onChange: (id: string, customer?: CrmCustomerOption | null) => void;
  partnerId?: string;
  partnerName?: string;
  customerId?: string;
  customerName?: string;
  matchedCustomer?: CrmCustomerOption | null;
}) {
  const { crm, integrations: intg } = useMessages();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CrmCustomerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<CrmCustomerSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);

  const suggestEnabled = !!(partnerId || customerId);
  const entityName = partnerName || customerName || "";
  const suggestLabel = customerId ? crm.suggestMatchCustomer : crm.suggestMatch;

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/customers?q=${encodeURIComponent(query.trim())}&limit=15`);
        const data = (await res.json()) as { customers?: CrmCustomerOption[] };
        setResults(data.customers ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function select(customer: CrmCustomerOption) {
    onChange(customer.id, customer);
    setQuery("");
    setOpen(false);
    setSuggestOpen(false);
    setSuggestMsg(null);
  }

  function runSuggest() {
    if (!partnerId && !customerId) return;
    setSuggestMsg(null);
    setSuggestOpen(true);
    startTransition(async () => {
      const res = partnerId
        ? await suggestCrmCustomersForPartnerAction(partnerId, 8)
        : await suggestCrmCustomersForCustomerAction(customerId!, 8);
      const name =
        ("partnerName" in res ? res.partnerName : res.customerName) || entityName;
      setSuggestions(res.candidates);
      if (res.candidates.length === 0) {
        setSuggestMsg(crm.suggestEmpty.replace("{name}", name));
      } else {
        setSuggestMsg(
          crm.suggestFound
            .replace("{count}", String(res.candidates.length))
            .replace("{name}", name),
        );
      }
    });
  }

  function matchReasonLabel(reason: CrmCustomerSuggestion["matchReason"]) {
    const map: Record<CrmCustomerSuggestion["matchReason"], string> = {
      exact: crm.matchExact,
      contains: crm.matchContains,
      token: crm.matchToken,
      prefix: crm.matchPrefix,
    };
    return map[reason];
  }

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="space-y-2">
      {suggestEnabled && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={runSuggest}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-sky-700 disabled:opacity-50"
            >
              {pending ? crm.suggestLoading : suggestLabel}
            </button>
            {entityName && (
              <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{entityName}</span>
            )}
          </div>

          {suggestOpen && suggestMsg && (
            <p
              className={`text-[11px] leading-relaxed ${
                suggestions.length ? "text-slate-500" : "text-amber-700"
              }`}
            >
              {suggestMsg}
            </p>
          )}

          {suggestOpen && suggestions.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-zinc-50">
              {suggestions.map((c) => {
                const selected = value === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(c)}
                    className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 ${
                      selected ? "bg-emerald-50/80 hover:bg-emerald-50/80" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-slate-800">{c.name}</div>
                      <span className="shrink-0 rounded bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px]">
                        {matchReasonLabel(c.matchReason)}
                      </span>
                    </div>
                    <div className="text-slate-500 mt-0.5">{formatCrmMeta(c)}</div>
                    {selected && (
                      <div className="text-emerald-700 mt-1">{crm.currentMatch}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {matchedCustomer ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
          <div className="font-medium">{matchedCustomer.name}</div>
          <div className="text-emerald-700/80 mt-0.5 font-mono break-all">{matchedCustomer.id}</div>
          <div className="text-emerald-700/70 mt-1">{formatCrmMeta(matchedCustomer)}</div>
          <a
            href={buildCrmCustomerViewUrl(matchedCustomer.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sky-700 hover:underline font-sans"
          >
            {intg.openInCrm} ↗
          </a>
        </div>
      ) : value ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 font-mono break-all">
          {value}
          <div className="text-amber-700 mt-1">{crm.customerNotInCache}</div>
          <a
            href={buildCrmCustomerViewUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sky-700 hover:underline font-sans"
          >
            {intg.openInCrm} ↗
          </a>
        </div>
      ) : null}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSuggestOpen(false);
          }}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={crm.searchPlaceholder}
          className={input}
        />
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0"
              >
                <div className="font-medium text-slate-800">{c.name}</div>
                <div className="text-slate-500 mt-0.5">{formatCrmMeta(c)}</div>
              </button>
            ))}
          </div>
        )}
        {loading && <div className="text-xs text-slate-400 mt-1">{crm.searching}</div>}
      </div>

      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("", null);
            setSuggestOpen(false);
            setSuggestions([]);
            router.refresh();
          }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
        >
          {crm.clearMatch}
        </button>
      )}
    </div>
  );
}
