"use client";

import { useState, useTransition } from "react";
import { triggerCrmSyncAction, saveCrmExtraRecordersAction } from "@/lib/crm-actions";
import { useMessages } from "@/lib/i18n/context";

export function CrmSyncCard({
  customerCount,
  contactCount,
  lastSyncAt,
  latestStatus,
  latestError,
  extraRecorders,
}: {
  customerCount: number;
  contactCount: number;
  lastSyncAt: string | null;
  latestStatus: string | null;
  latestError: string | null;
  extraRecorders: string;
}) {
  const crm = useMessages().crm;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [extra, setExtra] = useState(extraRecorders);

  function syncNow() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const res = await triggerCrmSyncAction();
      if ("error" in res && typeof res.error === "string") setError(res.error);
      else if ("message" in res && res.message) setMessage(res.message);
    });
  }

  function saveExtra() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("extraRecorders", extra);
      const res = await saveCrmExtraRecordersAction(fd);
      if ("error" in res && typeof res.error === "string") setError(res.error);
      else if ("message" in res && res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-zinc-500 leading-relaxed">{crm.syncDesc}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-lg font-bold text-zinc-900">{customerCount}</div>
          <div className="text-xs text-zinc-400">{crm.customerCount}</div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-lg font-bold text-zinc-900">{contactCount}</div>
          <div className="text-xs text-zinc-400">{crm.contactCount}</div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-xs font-medium text-zinc-700 break-words">
            {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : crm.neverSynced}
          </div>
          <div className="text-xs text-zinc-400">{crm.lastSync}</div>
        </div>
      </div>

      {latestStatus === "FAILED" && latestError && (
        <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">{latestError}</div>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={syncNow}
        className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-40"
      >
        {pending ? crm.syncing : crm.syncNow}
      </button>

      <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 space-y-2">
        <div className="text-xs font-medium text-zinc-700">{crm.extraRecordersLabel}</div>
        <p className="text-xs text-zinc-500 leading-relaxed">{crm.extraRecordersHint}</p>
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={5}
          placeholder={"Zayne.Zhao\nXuShengkai"}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          disabled={pending}
          onClick={saveExtra}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-40"
        >
          {crm.extraRecordersSave}
        </button>
      </div>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>}
    </div>
  );
}
