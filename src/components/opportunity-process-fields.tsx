"use client";

import { useState } from "react";
import {
  PROCESS_TAG_CODES,
  type ProcessTagCode,
  parseProcessTags,
  parseNextProcessTag,
} from "@/lib/opportunity-process-tags";
import { useMessages } from "@/lib/i18n/context";

const chipBase =
  "rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer select-none";
const chipOn = "border-sky-500 bg-sky-50 text-sky-800";
const chipOff = "border-slate-200 bg-white text-slate-600 hover:border-slate-300";

export function OpportunityProcessFields({
  defaultStage,
  defaultNextStep,
  className,
  idPrefix = "opp-process",
}: {
  defaultStage?: string;
  defaultNextStep?: string | null;
  className?: string;
  idPrefix?: string;
}) {
  const m = useMessages();
  const labels = m.opportunityProcess;
  const [selected, setSelected] = useState<ProcessTagCode[]>(() => parseProcessTags(defaultStage));
  const [next, setNext] = useState<ProcessTagCode | "">(() => parseNextProcessTag(defaultNextStep) ?? "");
  const nextId = `${idPrefix}-next`;

  function toggle(code: ProcessTagCode) {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  return (
    <div className={className ?? "col-span-2 md:col-span-3 space-y-3"}>
      <div>
        <div className="text-xs text-slate-500 mb-1.5">{m.common.stage}</div>
        <div className="flex flex-wrap gap-1.5">
          {PROCESS_TAG_CODES.map((code) => {
            const on = selected.includes(code);
            return (
              <label key={code} className={`${chipBase} ${on ? chipOn : chipOff}`}>
                <input
                  type="checkbox"
                  name="processTag"
                  value={code}
                  checked={on}
                  onChange={() => toggle(code)}
                  className="sr-only"
                />
                {labels[code]}
              </label>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1.5 block" htmlFor={nextId}>
          {m.common.nextStep}
        </label>
        <select
          id={nextId}
          name="nextStep"
          value={next}
          onChange={(e) => setNext((e.target.value as ProcessTagCode) || "")}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          aria-label={m.common.nextStep}
        >
          <option value="">{labels.nextNone}</option>
          {PROCESS_TAG_CODES.map((code) => (
            <option key={code} value={code}>
              {labels[code]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
