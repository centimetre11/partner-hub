"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { buildCrmLeadLinks } from "@/lib/crm-links";
import type { CrmLeadAction } from "@/lib/leads";

const linkClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95";

type RefreshResponse = {
  ok: boolean;
  status?: "updated" | "removed";
  reconciled?: boolean;
};

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
  const lastActionRef = useRef<CrmLeadAction | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  const handleRefresh = useCallback(
    async (action?: CrmLeadAction) => {
      setRefreshing(true);
      setMessage(null);
      const effectiveAction = action ?? lastActionRef.current ?? undefined;
      const needsFullFetch =
        !effectiveAction || effectiveAction === "edit" || effectiveAction === "shift";
      if (needsFullFetch) {
        setMessage(l.refreshSlowHint);
      }

      try {
        const qs = effectiveAction ? `?action=${encodeURIComponent(effectiveAction)}` : "";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/refresh${qs}`, {
          method: "POST",
          signal: controller.signal,
        });
        clearTimeout(timer);

        const data = (await res.json().catch(() => null)) as RefreshResponse | null;

        if (res.ok && data?.ok) {
          if (data.status === "removed") {
            setMessage(l.refreshedRemoved);
            router.push("/leads");
            return;
          }
          setMessage(data.reconciled === false ? l.refreshedUpdatedPending : l.refreshedUpdated);
          router.refresh();
        } else {
          setMessage(l.refreshFailed);
        }
      } catch {
        setMessage(l.refreshFailed);
      } finally {
        setRefreshing(false);
        lastActionRef.current = null;
      }
    },
    [leadId, l, router],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      if (
        document.visibilityState === "visible" &&
        hiddenAtRef.current &&
        Date.now() - hiddenAtRef.current >= 3000 &&
        lastActionRef.current &&
        !refreshing
      ) {
        void handleRefresh(lastActionRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [handleRefresh, refreshing]);

  if (!clueId) {
    return <p className="text-xs text-slate-500">{l.noClueIdHint}</p>;
  }

  const links = buildCrmLeadLinks(clueId);

  const markAction = (action: CrmLeadAction) => {
    lastActionRef.current = action;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          className={linkClass}
          href={links.view}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAction("view")}
        >
          {l.actionView}
        </a>
        <a
          className={linkClass}
          href={links.edit}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAction("edit")}
        >
          {l.actionEdit}
        </a>
        <a
          className={linkClass}
          href={links.toNurture}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAction("toNurture")}
        >
          {l.actionToNurture}
        </a>
        <a
          className={linkClass}
          href={links.toChannel}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAction("toChannel")}
        >
          {l.actionToChannel}
        </a>
        <a
          className={linkClass}
          href={links.toCustomer}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAction("toCustomer")}
        >
          {l.actionToCustomer}
        </a>
        <a
          className={linkClass}
          href={links.shift}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markAction("shift")}
        >
          {l.actionShift}
        </a>
        <button
          type="button"
          onClick={() => void handleRefresh()}
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
