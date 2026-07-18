"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessRecordForm } from "@/components/business-record-form";
import { useMessages } from "@/lib/i18n/context";
import type { OwnerRef } from "@/lib/owner";
import { parseOwnerRef } from "@/lib/todo-owner-select";

type Option = { id: string; name: string };

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function CreateBusinessRecordDrawer({
  partners,
  customers,
  buttonClassName,
}: {
  partners: Option[];
  customers: Option[];
  buttonClassName?: string;
}) {
  const m = useMessages();
  const q = m.dashboard.quickActions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ownerRef, setOwnerRef] = useState("");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setOwnerRef("");
  }, [open]);

  const parsed = parseOwnerRef(ownerRef);
  const owner: OwnerRef | null = parsed
    ? parsed.kind === "partner"
      ? { kind: "partner", id: parsed.id }
      : { kind: "customer", id: parsed.id }
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-slate-700 shrink-0"
        }
      >
        {buttonClassName ? q.businessRecordTitle : `+ ${q.businessRecordTitle}`}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/25"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="create-business-record-title"
            className="fixed right-0 top-0 z-50 flex h-full w-[min(22rem,92vw)] flex-col border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 id="create-business-record-title" className="text-sm font-semibold text-slate-900">
                {q.businessRecordTitle}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none text-slate-400 hover:text-slate-600"
                aria-label={m.common.cancel}
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-500">{q.businessRecordSelectTarget}</span>
                <select
                  value={ownerRef}
                  onChange={(e) => setOwnerRef(e.target.value)}
                  className={input}
                  autoFocus
                >
                  <option value="">{q.businessRecordNone}</option>
                  {partners.length > 0 && (
                    <optgroup label={q.businessRecordPartnersGroup}>
                      {partners.map((p) => (
                        <option key={p.id} value={`partner:${p.id}`}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {customers.length > 0 && (
                    <optgroup label={q.businessRecordCustomersGroup}>
                      {customers.map((c) => (
                        <option key={c.id} value={`customer:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>

              {owner ? (
                <BusinessRecordForm
                  owner={owner}
                  source="MANUAL"
                  compact
                  onDone={() => {
                    setOpen(false);
                    setOwnerRef("");
                    router.refresh();
                  }}
                />
              ) : (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  {q.businessRecordPickTarget}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
