"use client";

import { useState } from "react";
import { EmptyState, fmtDate } from "@/components/ui";
import { BusinessRecordForm } from "@/components/business-record-form";
import { AiAddButton } from "@/components/ai-add-button";
import { useLabels, useLocale, useMessages } from "@/lib/i18n/context";
import { localeToBcp47 } from "@/lib/i18n/locale";

type RecordRow = {
  id: string;
  category: string;
  title: string;
  content: string | null;
  occurredAt: Date | string;
  crmSyncedAt?: Date | string | null;
  crmSyncError?: string | null;
  createdBy: { name: string } | null;
  contact: { name: string } | null;
};

export function BusinessRecordsSection({
  partnerId,
  records,
  contacts = [],
}: {
  partnerId: string;
  records: RecordRow[];
  contacts?: { id: string; name: string }[];
}) {
  const pd = useMessages().partnerDetail;
  const labels = useLabels();
  const bcp47 = localeToBcp47(useLocale());
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <h3 className="text-sm font-semibold text-zinc-800">
          {pd.businessRecords.replace("{count}", String(records.length))}
        </h3>
        {!showForm && (
          <div className="flex items-center gap-2">
            <AiAddButton
              scope="business_record"
              partnerId={partnerId}
              label={pd.aiBusinessRecord}
              variant="soft"
            />
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700"
            >
              {pd.addBusinessRecord}
            </button>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        {showForm && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3">
            <BusinessRecordForm
              partnerId={partnerId}
              source="MANUAL"
              contacts={contacts}
              onDone={() => setShowForm(false)}
              compact
            />
          </div>
        )}
        {records.length > 0 ? (
          <ul className="space-y-2">
            {records.slice(0, 8).map((r) => (
              <li key={r.id} className="flex gap-2.5 items-start">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-800">{r.title}</div>
                  <div className="text-xs text-zinc-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-1 items-center">
                    <span>{labels.businessRecordCategoryLabels[r.category] ?? r.category}</span>
                    <span>· {fmtDate(r.occurredAt, bcp47)}</span>
                    {r.contact && <span>· {r.contact.name}</span>}
                    {r.createdBy && <span>· {r.createdBy.name}</span>}
                    {r.crmSyncedAt && (
                      <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5">{pd.crmSynced}</span>
                    )}
                    {!r.crmSyncedAt && r.crmSyncError && (
                      <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.5" title={r.crmSyncError}>
                        {pd.crmSyncFailed}
                      </span>
                    )}
                  </div>
                  {r.content && (
                    <p className="text-xs text-zinc-600 mt-1 whitespace-pre-wrap">{r.content}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !showForm && <EmptyState text={pd.noBusinessRecords} />
        )}
      </div>
    </div>
  );
}

export function BusinessRecordDialogButton({
  partnerId,
  contacts = [],
  label,
}: {
  partnerId: string;
  contacts?: { id: string; name: string }[];
  label?: string;
}) {
  const pd = useMessages().partnerDetail;
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <AiAddButton scope="business_record" partnerId={partnerId} label={pd.aiBusinessRecord} variant="soft" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100"
        >
          {label ?? pd.logBusinessRecord}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-800">{pd.logBusinessRecord}</h3>
            <BusinessRecordForm
              partnerId={partnerId}
              source="RELATIONSHIP_TAB"
              contacts={contacts}
              onDone={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
