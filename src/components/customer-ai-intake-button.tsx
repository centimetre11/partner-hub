"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import {
  draftCustomerFromTextAction,
  applyCustomerAiDraftAction,
  type CustomerAiDraft,
} from "@/lib/customer-actions";

export function CustomerAiIntakeButton({
  customerId,
  partnerId,
  variant = "soft",
}: {
  customerId?: string;
  partnerId?: string | null;
  variant?: "soft" | "primary";
}) {
  const router = useRouter();
  const messages = useMessages();
  const c = messages.customers;
  const ai = c.ai;
  const common = messages.common;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<CustomerAiDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setText("");
    setDraft(null);
    setError("");
    setLoading(false);
  }

  async function extract() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await draftCustomerFromTextAction(text);
      if (res.error || !res.draft) {
        setError(res.error === "empty" ? ai.aiNoResult : res.error ?? ai.aiNoResult);
        return;
      }
      setDraft(res.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!draft) return;
    setLoading(true);
    setError("");
    try {
      const res = await applyCustomerAiDraftAction(customerId ?? null, draft, partnerId);
      setOpen(false);
      reset();
      if (customerId) router.refresh();
      else router.push(`/customers/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function setField<K extends keyof CustomerAiDraft>(key: K, value: CustomerAiDraft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  const btnClass =
    variant === "primary"
      ? "rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
      : "rounded-lg border border-purple-200 bg-purple-50/60 text-purple-700 px-3 py-1.5 text-xs hover:bg-purple-50";
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnClass}>
        {ai.aiButton}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => { setOpen(false); reset(); }}>
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="font-semibold text-slate-900">{ai.aiTitle}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{ai.aiHint}</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              {!draft ? (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    placeholder={ai.aiPlaceholder}
                    className={input}
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setOpen(false); reset(); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                      {common.cancel}
                    </button>
                    <button type="button" disabled={loading || !text.trim()} onClick={() => void extract()} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50">
                      {loading ? ai.aiExtracting : ai.aiExtract}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {!customerId && (
                      <label className="text-sm sm:col-span-2">
                        <span className="text-xs text-slate-500">{c.colName}</span>
                        <input value={draft.name ?? ""} onChange={(e) => setField("name", e.target.value)} className={input} />
                      </label>
                    )}
                    <label className="text-sm">
                      <span className="text-xs text-slate-500">{c.industryLabel}</span>
                      <input value={draft.industry ?? ""} onChange={(e) => setField("industry", e.target.value)} className={input} />
                    </label>
                    <label className="text-sm">
                      <span className="text-xs text-slate-500">{c.scaleLabel}</span>
                      <input value={draft.scale ?? ""} onChange={(e) => setField("scale", e.target.value)} className={input} />
                    </label>
                    <label className="text-sm">
                      <span className="text-xs text-slate-500">{c.cityPlaceholder}</span>
                      <input value={draft.city ?? ""} onChange={(e) => setField("city", e.target.value)} className={input} />
                    </label>
                    <label className="text-sm">
                      <span className="text-xs text-slate-500">{c.countryPlaceholder}</span>
                      <input value={draft.country ?? ""} onChange={(e) => setField("country", e.target.value)} className={input} />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-xs text-slate-500">{c.websiteLabel}</span>
                      <input value={draft.website ?? ""} onChange={(e) => setField("website", e.target.value)} className={input} />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="text-xs text-slate-500">{c.notesPlaceholder}</span>
                      <textarea value={draft.notes ?? ""} onChange={(e) => setField("notes", e.target.value)} rows={2} className={input} />
                    </label>
                  </div>

                  {draft.contacts && draft.contacts.length > 0 && (
                    <div className="rounded-lg border border-slate-100 p-3">
                      <div className="text-xs font-medium text-slate-700 mb-2">{ai.contactsLabel.replace("{count}", String(draft.contacts.length))}</div>
                      <div className="space-y-1.5">
                        {draft.contacts.map((ct, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-slate-800">{ct.name}</span>
                            <span className="text-xs text-slate-400">{[ct.title, ct.department].filter(Boolean).join(" · ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between gap-2">
                    <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                      {ai.aiBack}
                    </button>
                    <button type="button" disabled={loading} onClick={() => void apply()} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50">
                      {loading ? ai.aiApplying : ai.aiApply}
                    </button>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
