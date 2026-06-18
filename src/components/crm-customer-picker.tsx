"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { suggestCrmCustomerForPartnerAction } from "@/lib/crm-actions";

export type CrmCustomerOption = {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
  salesman: string | null;
};

export function CrmCustomerPicker({
  value,
  onChange,
  partnerId,
  matchedCustomer,
}: {
  value: string;
  onChange: (id: string, customer?: CrmCustomerOption | null) => void;
  partnerId?: string;
  matchedCustomer?: CrmCustomerOption | null;
}) {
  const crm = useMessages().crm;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CrmCustomerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

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
  }

  function suggest() {
    if (!partnerId) return;
    startTransition(async () => {
      const hit = await suggestCrmCustomerForPartnerAction(partnerId);
      if (hit) select(hit);
    });
  }

  const input =
    "w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="space-y-2">
      {matchedCustomer ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
          <div className="font-medium">{matchedCustomer.name}</div>
          <div className="text-emerald-700/80 mt-0.5 font-mono break-all">{matchedCustomer.id}</div>
          <div className="text-emerald-700/70 mt-1">
            {[matchedCustomer.city, matchedCustomer.status, matchedCustomer.salesman].filter(Boolean).join(" · ")}
          </div>
        </div>
      ) : value ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 font-mono break-all">
          {value}
          <div className="text-amber-700 mt-1">{crm.customerNotInCache}</div>
        </div>
      ) : null}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={crm.searchPlaceholder}
          className={input}
        />
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 border-b border-zinc-50 last:border-0"
              >
                <div className="font-medium text-zinc-800">{c.name}</div>
                <div className="text-zinc-500 mt-0.5">
                  {[c.city, c.status, c.salesman].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
        {loading && <div className="text-xs text-zinc-400 mt-1">{crm.searching}</div>}
      </div>

      <div className="flex flex-wrap gap-2">
        {partnerId && (
          <button
            type="button"
            disabled={pending}
            onClick={suggest}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-indigo-300 disabled:opacity-50"
          >
            {crm.suggestMatch}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("", null);
              router.refresh();
            }}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
          >
            {crm.clearMatch}
          </button>
        )}
      </div>
    </div>
  );
}
