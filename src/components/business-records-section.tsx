"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, fmtDate } from "@/components/ui";
import { BusinessRecordForm } from "@/components/business-record-form";
import { BusinessRecordCrmStatus } from "@/components/business-record-crm-status";
import { AiAddButton } from "@/components/ai-add-button";
import { deleteBusinessRecordAction } from "@/lib/actions";
import { BUSINESS_RECORD_PAGE_SIZE } from "@/lib/business-record-core";
import { useLabels, useLocale, useMessages } from "@/lib/i18n/context";
import { localeToBcp47 } from "@/lib/i18n/locale";
import type { OwnerRef } from "@/lib/owner";

type RecordRow = {
  id: string;
  category: string;
  title: string;
  content: string | null;
  occurredAt: Date | string;
  crmTraceNature?: string | null;
  crmTraceAction?: string | null;
  crmSyncedAt?: Date | string | null;
  crmSyncStatus?: string | null;
  crmSyncError?: string | null;
  createdBy: { name: string } | null;
  contact: { name: string } | null;
};

type PaginatedResponse = {
  items: RecordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function ownerQuery(owner: OwnerRef) {
  return owner.kind === "customer" ? `customerId=${owner.id}` : `partnerId=${owner.id}`;
}

export function BusinessRecordsSection({
  owner,
  records,
  totalCount,
  contacts = [],
}: {
  owner: OwnerRef;
  records: RecordRow[];
  totalCount: number;
  contacts?: { id: string; name: string }[];
}) {
  const { partnerDetail: pd, common } = useMessages();
  const labels = useLabels();
  const bcp47 = localeToBcp47(useLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(records);
  const [total, setTotal] = useState(totalCount);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(totalCount / BUSINESS_RECORD_PAGE_SIZE)));
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(BUSINESS_RECORD_PAGE_SIZE),
        });
        const res = await fetch(`/api/business-record?${ownerQuery(owner)}&${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as PaginatedResponse;
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } finally {
        setLoading(false);
      }
    },
    [owner],
  );

  useEffect(() => {
    setTotal(totalCount);
    setTotalPages(Math.max(1, Math.ceil(totalCount / BUSINESS_RECORD_PAGE_SIZE)));
    if (page === 1) {
      setItems(records);
    }
  }, [records, totalCount, page]);

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    void loadPage(nextPage);
  }

  function removeRecord(recordId: string) {
    startTransition(async () => {
      await deleteBusinessRecordAction(owner, recordId);
      const nextPage = items.length === 1 && page > 1 ? page - 1 : page;
      await loadPage(nextPage);
      router.refresh();
    });
  }

  function handleFormDone() {
    setShowForm(false);
    void loadPage(1);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">
          {pd.businessRecords.replace("{count}", String(total))}
        </h3>
        {!showForm && (
          <div className="flex items-center gap-2">
            {owner.kind === "partner" && (
              <AiAddButton
                scope="business_record"
                partnerId={owner.id}
                label={pd.aiBusinessRecord}
                variant="soft"
              />
            )}
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-800"
            >
              {pd.addBusinessRecord}
            </button>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        {showForm && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-3">
            <BusinessRecordForm
              owner={owner}
              source="MANUAL"
              contacts={contacts}
              onDone={handleFormDone}
              compact
            />
          </div>
        )}
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-400">{common.loading}</div>
        ) : items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex gap-2.5 items-start group">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-slate-800">{r.title}</div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeRecord(r.id)}
                      className="text-xs text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      {common.delete}
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-2 gap-y-1 items-center">
                    {r.crmTraceNature && r.crmTraceAction ? (
                      <span>
                        {labels.crmTraceNatureLabels[r.crmTraceNature] ?? r.crmTraceNature}
                        {" · "}
                        {labels.crmTraceActionLabels[r.crmTraceAction] ?? r.crmTraceAction}
                      </span>
                    ) : (
                      <span>{labels.businessRecordCategoryLabels[r.category] ?? r.category}</span>
                    )}
                    <span>· {fmtDate(r.occurredAt, bcp47)}</span>
                    {r.contact && <span>· {r.contact.name}</span>}
                    {r.createdBy && <span>· {r.createdBy.name}</span>}
                  </div>
                  <BusinessRecordCrmStatus record={r} />
                  {r.content && (
                    <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{r.content}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !showForm && <EmptyState text={pd.noBusinessRecords} />
        )}
        {total > BUSINESS_RECORD_PAGE_SIZE && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-400">
              {pd.businessRecordsPageOf
                .replace("{page}", String(page))
                .replace("{total}", String(totalPages))}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => goToPage(page - 1)}
                className="px-3 py-1 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pd.businessRecordsPrevPage}
              </button>
              <button
                type="button"
                disabled={loading || page >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="px-3 py-1 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pd.businessRecordsNextPage}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BusinessRecordDialogButton({
  owner,
  contacts = [],
  label,
  buttonClassName,
  hideAi = false,
}: {
  owner: OwnerRef;
  contacts?: { id: string; name: string }[];
  label?: string;
  buttonClassName?: string;
  hideAi?: boolean;
}) {
  const pd = useMessages().partnerDetail;
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {!hideAi && owner.kind === "partner" ? (
          <AiAddButton scope="business_record" partnerId={owner.id} label={pd.aiBusinessRecord} variant="soft" />
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            buttonClassName ??
            "rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-sky-700 hover:bg-slate-100"
          }
        >
          {label ?? pd.logBusinessRecord}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg border border-slate-200 max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-800">{pd.logBusinessRecord}</h3>
            <BusinessRecordForm
              owner={owner}
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
