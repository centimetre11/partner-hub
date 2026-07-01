"use client";

import { useEffect, useState } from "react";
import { useMessages } from "@/lib/i18n/context";

export type CrmRecorderOption = {
  id: string;
  name: string;
  crmSalesmanName: string | null;
};

export function CrmRecorderPicker({
  recorders,
  currentUserId,
  selectedIds,
  onChange,
  compact = false,
}: {
  recorders: CrmRecorderOption[];
  currentUserId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const ip = useMessages().intakePanel;
  const mapped = recorders.filter((r) => r.crmSalesmanName);
  const showList = mapped.length > 0 ? mapped : recorders;

  function toggle(id: string, mappedToCrm: boolean) {
    if (!mappedToCrm) return;
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 1) return;
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  }

  return (
    <div className="space-y-1.5">
      <div>
        <span className="text-xs text-slate-500">{ip.crmRecorderLabel}</span>
        <p className="text-[11px] text-slate-500 mt-0.5">{ip.crmRecorderHint}</p>
      </div>
      <div className={`flex flex-wrap gap-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        {showList.map((r) => {
          const mappedToCrm = !!r.crmSalesmanName;
          const checked = selectedIds.includes(r.id);
          const isSelf = r.id === currentUserId;
          return (
            <label
              key={r.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 cursor-pointer ${
                mappedToCrm
                  ? checked
                    ? "border-slate-800 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={!mappedToCrm}
                onChange={() => toggle(r.id, mappedToCrm)}
              />
              <span>
                {isSelf ? ip.crmRecorderSelf : r.name}
                {r.crmSalesmanName ? ` (${r.crmSalesmanName})` : ` ${ip.crmRecorderUnmapped}`}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function useDefaultCrmRecorderSelection(
  recorders: CrmRecorderOption[] | undefined,
  currentUserId: string | undefined,
) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUserId || !recorders?.length) {
      setSelectedIds([]);
      return;
    }
    const self = recorders.find((r) => r.id === currentUserId);
    if (self?.crmSalesmanName) {
      setSelectedIds([currentUserId]);
      return;
    }
    const firstMapped = recorders.find((r) => r.crmSalesmanName);
    setSelectedIds(firstMapped ? [firstMapped.id] : []);
  }, [recorders, currentUserId]);

  return [selectedIds, setSelectedIds] as const;
}
