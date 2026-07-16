"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerLeadsSyncAction } from "@/lib/leads-actions";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

export function LeadsSyncButton() {
  const l = useMessages().leads;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function syncNow() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await triggerLeadsSyncAction();
      if ("error" in res && res.error) {
        setError(
          res.error === "SYNC_IN_PROGRESS" ? l.syncInProgress : res.error === "Leads sync failed" ? l.syncFailed : res.error,
        );
        return;
      }
      if ("ok" in res && res.ok) {
        setMessage(formatMsg(l.syncSuccess, { count: res.leadCount, ms: res.durationMs }));
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={syncNow}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
      >
        {pending ? l.syncing : l.syncNow}
      </button>
      {message && <p className="text-xs text-emerald-700 max-w-xs text-right">{message}</p>}
      {error && <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>}
    </div>
  );
}
