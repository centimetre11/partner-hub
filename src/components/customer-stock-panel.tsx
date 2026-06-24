"use client";

import { useState } from "react";
import { updateCustomerStockAction } from "@/lib/customer-actions";
import { useMessages } from "@/lib/i18n/context";

type StockStep = {
  letter: string;
  word: string;
  name: string;
  desc: string;
  placeholder: string;
  field: string;
  value: string | null;
};

const input =
  "w-full border-0 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-300 resize-y";

export function CustomerStockPanel({
  customerId,
  customerName,
  steps,
}: {
  customerId: string;
  customerName: string;
  steps: StockStep[];
}) {
  const m = useMessages();
  const c = m.customers;
  const sq = c.stock;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 flex-1">
          <h3 className="text-sm font-semibold text-indigo-900">{sq.title}</h3>
          <p className="text-xs text-indigo-700/80 mt-1 leading-relaxed">{sq.intro}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-sky-600 hover:underline shrink-0 mt-1">
          {c.editStock}
        </button>
      </div>

      <div className="space-y-4">
        {steps.map((s) => (
          <div key={s.field} className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3 bg-slate-50/60 border-b border-slate-100">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {s.letter}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {s.name}
                  <span className="ml-2 text-[11px] font-normal text-slate-400">{s.word}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
            <div className="px-4 py-3 text-sm whitespace-pre-wrap">
              {s.value?.trim() ? (
                <span className="text-slate-800">{s.value}</span>
              ) : (
                <span className="text-slate-300">{m.common.toBeFilled}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{c.editStockTitle.replace("{name}", customerName)}</h3>
            <form
              action={async (fd) => {
                await updateCustomerStockAction(customerId, fd);
                setOpen(false);
              }}
              className="space-y-4"
            >
              {steps.map((s) => (
                <div key={s.field} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                      {s.letter}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {s.name}
                        <span className="ml-2 text-[11px] font-normal text-slate-400">{s.word}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                  <textarea name={s.field} defaultValue={s.value ?? ""} rows={3} placeholder={s.placeholder} className={input} />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  {m.common.cancel}
                </button>
                <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">{sq.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
