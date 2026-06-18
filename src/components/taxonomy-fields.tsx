"use client";

import Link from "next/link";
import type { TaxonomyDimension, TaxonomyOptionRow } from "@/lib/taxonomy";
import { useLabels, useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const LIBRARY_PATHS: Record<TaxonomyDimension, string> = {
  ARCHETYPE: "/taxonomy?dim=ARCHETYPE",
  INDUSTRY: "/taxonomy?dim=INDUSTRY",
  VALUE_PATTERN: "/taxonomy?dim=VALUE_PATTERN",
  CATEGORY: "/taxonomy?dim=CATEGORY",
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
        <span className="text-xs text-zinc-500">{meta.label}</span>
        <Link
          href={LIBRARY_PATHS[dimension]}
          target="_blank"
          className="text-xs text-indigo-600 hover:underline shrink-0"
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
        <span className="text-xs text-zinc-500">{meta.label} ({m.common.multiSelect})</span>
        <Link
          href={LIBRARY_PATHS[dimension]}
          target="_blank"
          className="text-xs text-indigo-600 hover:underline shrink-0"
        >
          {m.common.taxonomyPlus}
        </Link>
      </div>
      <div className="rounded-lg border border-zinc-200 p-2 max-h-36 overflow-y-auto grid grid-cols-2 gap-1">
        {options.map((o) => (
          <label key={o.code} className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer py-1 px-1 rounded hover:bg-zinc-50">
            <input
              type="checkbox"
              name={name}
              value={o.code}
              defaultChecked={selected.includes(o.code)}
              className="rounded border-zinc-300"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
