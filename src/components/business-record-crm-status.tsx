"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryCrmBusinessRecordSyncAction } from "@/lib/crm-actions";
import { resolveBusinessRecordCrmSync } from "@/lib/business-record-core";
import { useLocale, useMessages } from "@/lib/i18n/context";
import { localeToBcp47 } from "@/lib/i18n/locale";
import { fmtDate } from "@/components/ui";

type RecordCrmFields = {
  id: string;
  crmSyncStatus?: string | null;
  crmSyncedAt?: Date | string | null;
  crmSyncError?: string | null;
};

const STATUS_STYLE = {
  SYNCED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  FAILED: "bg-red-50 text-red-700 border-red-100",
  SKIPPED: "bg-amber-50 text-amber-800 border-amber-100",
} as const;

export function BusinessRecordCrmStatus({ record }: { record: RecordCrmFields }) {
  const pd = useMessages().partnerDetail;
  const bcp47 = localeToBcp47(useLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const sync = resolveBusinessRecordCrmSync(record);

  if (sync.status === "PENDING") return null;

  const label =
    sync.status === "SYNCED"
      ? pd.crmSyncStatusSynced
      : sync.status === "FAILED"
        ? pd.crmSyncStatusFailed
        : pd.crmSyncStatusSkipped;

  function retry() {
    startTransition(async () => {
      await retryCrmBusinessRecordSyncAction(record.id);
      router.refresh();
    });
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className={`rounded border px-1.5 py-0.5 font-medium ${STATUS_STYLE[sync.status]}`}>
        {label}
        {sync.status === "SYNCED" && sync.syncedAt ? ` · ${fmtDate(sync.syncedAt, bcp47)}` : ""}
      </span>
      {sync.reason && sync.status !== "SYNCED" && (
        <span className="text-zinc-500">{sync.reason}</span>
      )}
      {(sync.status === "FAILED" || sync.status === "SKIPPED") && (
        <button
          type="button"
          disabled={pending}
          onClick={retry}
          className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
        >
          {pd.crmSyncRetry}
        </button>
      )}
    </div>
  );
}
