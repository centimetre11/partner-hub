"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { buildCrmLeadLinks } from "@/lib/crm-links";

const linkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95";

export function LeadActions({
  leadId,
  clueId,
}: {
  leadId: string;
  clueId: string | null;
}) {
  const m = useMessages();
  const l = m.leads;
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!clueId) {
    return <p className="text-xs text-slate-500">{l.noClueIdHint}</p>;
  }

  const links = buildCrmLeadLinks(clueId);

  const handleRefresh = async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/refresh`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; status?: "updated" | "removed" }
        | null;

      if (res.ok && data?.ok) {
        if (data.status === "removed") {
          setMessage(l.refreshedRemoved);
          router.push("/leads");
          return;
        }
        setMessage(l.refreshedUpdated);
        router.refresh();
      } else {
        setMessage(l.refreshFailed);
      }
    } catch {
      setMessage(l.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
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
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white shadow-sm transition-all hover:bg-slate-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? l.refreshing : l.refreshLead}
        </button>
      </div>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
