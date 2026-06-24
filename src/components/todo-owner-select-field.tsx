import type { TodoOwnerOption } from "@/lib/todo-owner-select";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";

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
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select name={name} defaultValue={defaultValue} className={className}>
        <option value="">{noneLabel}</option>
        {partners.length > 0 && (
          <optgroup label={partnersGroupLabel}>
            {partners.map((p) => (
              <option key={p.id} value={encodeTodoOwnerRef("partner", p.id)}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
        {customers.length > 0 && (
          <optgroup label={customersGroupLabel}>
            {customers.map((c) => (
              <option key={c.id} value={encodeTodoOwnerRef("customer", c.id)}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
