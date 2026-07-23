"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLeadReviewMeetingAction,
  previewLeadReviewAgendaAction,
} from "@/lib/lead-review/actions";
import type { LeadReviewConfig } from "@/lib/lead-review/types";
import type { AgendaCandidate } from "@/lib/lead-review/select";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

export function CreateLeadReviewForm({
  salesmen,
  initialConfig,
}: {
  salesmen: string[];
  initialConfig: LeadReviewConfig;
}) {
  const m = useMessages().leadReview;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [allSalesmen, setAllSalesmen] = useState(initialConfig.allSalesmen);
  const [selectedSales, setSelectedSales] = useState<string[]>(
    initialConfig.allSalesmen ? [] : initialConfig.salesmanNames,
  );
  const [channelCount, setChannelCount] = useState(initialConfig.channelCount);
  const [nurtureCount, setNurtureCount] = useState(initialConfig.nurtureCount);
  const [includeCustomer, setIncludeCustomer] = useState(
    initialConfig.includeChannelCustomer,
  );
  const [preview, setPreview] = useState<AgendaCandidate[] | null>(null);
  const [previewStale, setPreviewStale] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewing, startPreview] = useTransition();

  const config: Partial<LeadReviewConfig> = useMemo(
    () => ({
      allSalesmen,
      salesmanNames: allSalesmen ? [] : selectedSales,
      channelCount,
      nurtureCount,
      includeChannelCustomer: includeCustomer,
    }),
    [allSalesmen, selectedSales, channelCount, nurtureCount, includeCustomer],
  );

  function markConfigChanged() {
    setPreviewStale(true);
    setError(null);
  }

  function toggleSales(name: string) {
    setAllSalesmen(false);
    setSelectedSales((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
    markConfigChanged();
  }

  function loadPreview() {
    if (!allSalesmen && selectedSales.length === 0) {
      setError(m.errSelectSales);
      return;
    }
    if ((channelCount || 0) <= 0 && (nurtureCount || 0) <= 0) {
      setError(m.errCounts);
      return;
    }
    startPreview(async () => {
      setError(null);
      const res = await previewLeadReviewAgendaAction(config);
      setPreview(res.items);
      setPreviewStale(false);
    });
  }

  function submit() {
    if (!allSalesmen && selectedSales.length === 0) {
      setError(m.errSelectSales);
      return;
    }
    if (previewStale || preview === null) {
      setError(m.errNeedPull);
      return;
    }
    if (preview.length === 0) {
      setError(m.errNoItems);
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await createLeadReviewMeetingAction({
        title: title.trim() || undefined,
        config,
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("id" in res && res.id) {
        setOpen(false);
        router.push(`/lead-reviews/${res.id}`);
      }
    });
  }

  function openForm() {
    setOpen(true);
    setTitle("");
    setAllSalesmen(initialConfig.allSalesmen);
    setSelectedSales(initialConfig.allSalesmen ? [] : initialConfig.salesmanNames);
    setChannelCount(initialConfig.channelCount);
    setNurtureCount(initialConfig.nurtureCount);
    setIncludeCustomer(initialConfig.includeChannelCustomer);
    setPreview(null);
    setPreviewStale(true);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
      >
        {m.create}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">{m.createTitle}</h2>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={() => setOpen(false)}
          >
            {m.close}
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs text-slate-500">{m.meetingTitle}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={m.meetingTitlePh}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">{m.channelCount}</label>
              <input
                type="number"
                min={0}
                max={50}
                value={channelCount}
                onChange={(e) => {
                  setChannelCount(Number(e.target.value) || 0);
                  markConfigChanged();
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{m.nurtureCount}</label>
              <input
                type="number"
                min={0}
                max={50}
                value={nurtureCount}
                onChange={(e) => {
                  setNurtureCount(Number(e.target.value) || 0);
                  markConfigChanged();
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeCustomer}
              onChange={(e) => {
                setIncludeCustomer(e.target.checked);
                markConfigChanged();
              }}
            />
            {m.includeCustomerHint}
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500">{m.salesScope}</label>
              <button
                type="button"
                className="text-xs text-sky-700 hover:underline"
                onClick={() => {
                  setAllSalesmen(true);
                  setSelectedSales([]);
                  markConfigChanged();
                }}
              >
                {m.selectAllSales}
              </button>
            </div>
            {allSalesmen ? (
              <p className="text-sm text-slate-600 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                {m.currentAllSales}
              </p>
            ) : null}
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-50">
              {salesmen.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={!allSalesmen && selectedSales.includes(name)}
                    onChange={() => toggleSales(name)}
                  />
                  {name}
                </label>
              ))}
              {!salesmen.length ? (
                <p className="px-3 py-2 text-sm text-slate-400">{m.noSalesData}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                {m.previewLabel}
                {preview !== null && !previewStale
                  ? formatMsg(m.previewCount, { n: preview.length })
                  : m.previewNotPulled}
              </div>
              <button
                type="button"
                disabled={previewing}
                onClick={loadPreview}
                className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
              >
                {previewing ? m.pulling : m.pullList}
              </button>
            </div>
            {previewStale && preview !== null ? (
              <p className="text-xs text-amber-700">{m.previewStale}</p>
            ) : null}
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-50 text-sm min-h-[3rem]">
              {preview === null || previewStale ? (
                <li className="px-3 py-3 text-slate-400">{m.previewNeedPull}</li>
              ) : preview.length === 0 ? (
                <li className="px-3 py-2 text-slate-400">{m.previewEmpty}</li>
              ) : (
                preview.map((it, idx) => (
                  <li key={`${it.source}-${it.channelId ?? it.leadId}-${idx}`} className="px-3 py-2">
                    <div className="font-medium text-slate-800">{it.displayName}</div>
                    <div className="text-xs text-slate-500">{it.meta}</div>
                  </li>
                ))
              )}
            </ul>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
            onClick={() => setOpen(false)}
          >
            {m.cancel}
          </button>
          <button
            type="button"
            disabled={pending || previewing || previewStale || preview === null}
            onClick={submit}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-40"
          >
            {pending ? m.creating : m.createSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
