"use client";

import Link from "next/link";
import type { TaxonomyDimension, TaxonomyOptionRow } from "@/lib/taxonomy";
import { useLabels, useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

const LIBRARY_PATHS: Record<TaxonomyDimension, string> = {
  ARCHETYPE: "/taxonomy?dim=ARCHETYPE",
  INDUSTRY: "/taxonomy?dim=INDUSTRY",
  VALUE_PATTERN: "/taxonomy?dim=VALUE_PATTERN",
  CATEGORY: "/taxonomy?dim=CATEGORY",
  CAPABILITY: "/taxonomy?dim=CAPABILITY",
  CUSTOMER_SEGMENT: "/taxonomy?dim=CUSTOMER_SEGMENT",
  BUYING_TRIGGER: "/taxonomy?dim=BUYING_TRIGGER",
  ENTRY_PATH: "/taxonomy?dim=ENTRY_PATH",
  ICP_TIER: "/taxonomy?dim=ICP_TIER",
  WIN_FACTOR: "/taxonomy?dim=WIN_FACTOR",
  LOSS_REASON: "/taxonomy?dim=LOSS_REASON",
};

export function TaxonomySelectField({
  dimension,
  name,
  value,
  options,
  emptyLabel,
}: {
  dimension: TaxonomyDimension;
  name: string;
  value: string;
  options: TaxonomyOptionRow[];
  emptyLabel?: string;
}) {
  const labels = useLabels();
  const m = useMessages();
  const meta = labels.taxonomyMeta[dimension];
  return (
    <label className="space-y-1 block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{meta.label}</span>
        <Link
          href={LIBRARY_PATHS[dimension]}
          target="_blank"
          className="text-xs text-sky-600 hover:underline shrink-0"
        >
          {m.common.taxonomyPlus}
        </Link>
      </div>
      <select name={name} defaultValue={value} className={input}>
        <option value="">{emptyLabel ?? m.common.select}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
            {!o.isBuiltin ? ` (${m.common.custom})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TaxonomyMultiField({
  dimension,
  name,
  selected,
  options,
}: {
  dimension: TaxonomyDimension;
  name: string;
  selected: string[];
  options: TaxonomyOptionRow[];
}) {
  const labels = useLabels();
  const m = useMessages();
  const meta = labels.taxonomyMeta[dimension];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{meta.label} ({m.common.multiSelect})</span>
        <Link
          href={LIBRARY_PATHS[dimension]}
          target="_blank"
          className="text-xs text-sky-600 hover:underline shrink-0"
        >
          {m.common.taxonomyPlus}
        </Link>
      </div>
      <div className="rounded-lg border border-slate-200 p-2 max-h-36 overflow-y-auto grid grid-cols-2 gap-1">
        {options.map((o) => (
          <label key={o.code} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1 px-1 rounded hover:bg-slate-50">
            <input
              type="checkbox"
              name={name}
              value={o.code}
              defaultChecked={selected.includes(o.code)}
              className="rounded border-slate-300"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
