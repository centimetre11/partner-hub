"use client";

import Link from "next/link";
import type { TaxonomyDimension, TaxonomyOptionRow } from "@/lib/taxonomy";
import { TAXONOMY_DIMENSION_META } from "@/lib/taxonomy";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function TaxonomySelectField({
  dimension,
  name,
  value,
  options,
  emptyLabel = "待选择",
}: {
  dimension: TaxonomyDimension;
  name: string;
  value: string;
  options: TaxonomyOptionRow[];
  emptyLabel?: string;
}) {
  const meta = TAXONOMY_DIMENSION_META[dimension];
  return (
    <label className="space-y-1 block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">{meta.label}</span>
        <Link
          href={meta.libraryPath}
          target="_blank"
          className="text-xs text-indigo-600 hover:underline shrink-0"
        >
          维度库 +
        </Link>
      </div>
      <select name={name} defaultValue={value} className={input}>
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
            {!o.isBuiltin ? " (自定义)" : ""}
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
  const meta = TAXONOMY_DIMENSION_META[dimension];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">{meta.label}（可多选）</span>
        <Link
          href={meta.libraryPath}
          target="_blank"
          className="text-xs text-indigo-600 hover:underline shrink-0"
        >
          维度库 +
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
