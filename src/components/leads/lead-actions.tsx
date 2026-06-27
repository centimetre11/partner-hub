"use client";

import { useMessages } from "@/lib/i18n/context";
import { buildCrmLeadLinks } from "@/lib/crm-links";

const linkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95";

export function LeadActions({
  clueId,
}: {
  leadId: string;
  clueId: string | null;
}) {
  const l = useMessages().leads;

  if (!clueId) {
    return <p className="text-xs text-slate-500">{l.noClueIdHint}</p>;
  }

  const links = buildCrmLeadLinks(clueId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={linkClass} href={links.view} target="_blank" rel="noopener noreferrer">
        {l.actionView}
      </a>
      <a className={linkClass} href={links.edit} target="_blank" rel="noopener noreferrer">
        {l.actionEdit}
      </a>
      <a className={linkClass} href={links.toNurture} target="_blank" rel="noopener noreferrer">
        {l.actionToNurture}
      </a>
      <a className={linkClass} href={links.toChannel} target="_blank" rel="noopener noreferrer">
        {l.actionToChannel}
      </a>
      <a className={linkClass} href={links.toCustomer} target="_blank" rel="noopener noreferrer">
        {l.actionToCustomer}
      </a>
      <a className={linkClass} href={links.shift} target="_blank" rel="noopener noreferrer">
        {l.actionShift}
      </a>
    </div>
  );
}
