"use client";

import { useMemo } from "react";
import type { TodoOwnerOption } from "@/lib/todo-owner-select";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";

export function TodoOwnerSelectField({
  partners,
  customers,
  label,
  noneLabel,
  partnersGroupLabel,
  customersGroupLabel,
  name = "ownerRef",
  className,
  defaultValue = "",
}: {
  partners: TodoOwnerOption[];
  customers: TodoOwnerOption[];
  label: string;
  noneLabel: string;
  partnersGroupLabel: string;
  customersGroupLabel: string;
  name?: string;
  className?: string;
  defaultValue?: string;
}) {
  const options = useMemo<SearchableOption[]>(() => {
    const opts: SearchableOption[] = [];
    for (const p of partners)
      opts.push({ value: encodeTodoOwnerRef("partner", p.id), label: p.name, group: partnersGroupLabel });
    for (const c of customers)
      opts.push({ value: encodeTodoOwnerRef("customer", c.id), label: c.name, group: customersGroupLabel });
    return opts;
  }, [partners, customers, partnersGroupLabel, customersGroupLabel]);

  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <SearchableSelect
        name={name}
        defaultValue={defaultValue}
        options={options}
        emptyLabel={noneLabel}
        className={className}
        aria-label={label}
      />
    </label>
  );
}
