"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PartnerRow = { id: string; name: string; country: string | null; tier: string | null };
type CustomerRow = { id: string; name: string; country: string | null; status: string };

export function MobileDirectorySearch({
  partners,
  customers,
  labels,
  unknownRegion,
}: {
  partners: PartnerRow[];
  customers: CustomerRow[];
  labels: {
    searchPlaceholder: string;
    partners: string;
    customers: string;
    emptySearch: string;
  };
  unknownRegion: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filteredPartners = useMemo(
    () => (q ? partners.filter((p) => p.name.toLowerCase().includes(q)) : partners),
    [partners, q],
  );
  const filteredCustomers = useMemo(
    () => (q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers),
    [customers, q],
  );

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.searchPlaceholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{labels.partners}</h3>
        <div className="space-y-2">
          {filteredPartners.map((p) => (
            <Link
              key={p.id}
              href={`/partners/${p.id}`}
              className="block rounded-2xl border border-slate-100 bg-slate-50/70 p-3 hover:border-slate-300"
            >
              <div className="truncate text-sm font-medium text-slate-900">{p.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {[p.tier ? `Tier ${p.tier}` : null, p.country ?? unknownRegion].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
          {filteredPartners.length === 0 && (
            <p className="text-sm text-slate-400">{labels.emptySearch}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{labels.customers}</h3>
        <div className="space-y-2">
          {filteredCustomers.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="block rounded-2xl border border-slate-100 bg-slate-50/70 p-3 hover:border-slate-300"
            >
              <div className="truncate text-sm font-medium text-slate-900">{c.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {[c.status, c.country ?? unknownRegion].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
          {filteredCustomers.length === 0 && (
            <p className="text-sm text-slate-400">{labels.emptySearch}</p>
          )}
        </div>
      </div>
    </div>
  );
}
