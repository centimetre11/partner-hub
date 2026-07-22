"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLeadReviewMeetingAction,
  previewLeadReviewAgendaAction,
} from "@/lib/lead-review/actions";
import type { LeadReviewConfig } from "@/lib/lead-review/types";
import type { AgendaCandidate } from "@/lib/lead-review/select";

export function CreateLeadReviewForm({
  salesmen,
  initialConfig,
}: {
  salesmen: string[];
  initialConfig: LeadReviewConfig;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
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
      setError("请先选择销售，或点「全选（全部销售）」");
      return;
    }
    if ((channelCount || 0) <= 0 && (nurtureCount || 0) <= 0) {
      setError("Channel 条数与培育条数至少填一个大于 0");
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
      setError("请先选择销售，或点「全选（全部销售）」");
      return;
    }
    if (previewStale || preview === null) {
      setError("请先点「按当前选项拉取名单」确认预览后再创建");
      return;
    }
    if (preview.length === 0) {
      setError("当前选项下没有可过的线索，请调整后再拉取");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await createLeadReviewMeetingAction({
        title: title.trim() || undefined,
        scheduledAt: scheduledAt || undefined,
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
    setScheduledAt("");
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
        新建过线索会议
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">新建过线索会议</h2>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={() => setOpen(false)}
          >
            关闭
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs text-slate-500">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可选，默认按日期生成"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">计划时间（可选）</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">Channel 条数</label>
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
              <label className="text-xs text-slate-500">培育条数</label>
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
            Channel 含「客户」类型（默认只要线索）
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500">销售范围</label>
              <button
                type="button"
                className="text-xs text-sky-700 hover:underline"
                onClick={() => {
                  setAllSalesmen(true);
                  setSelectedSales([]);
                  markConfigChanged();
                }}
              >
                全选（全部销售）
              </button>
            </div>
            {allSalesmen ? (
              <p className="text-sm text-slate-600 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                当前：全部销售
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
                <p className="px-3 py-2 text-sm text-slate-400">暂无销售名数据</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                预览将过名单
                {preview !== null && !previewStale
                  ? `（${preview.length} 条）`
                  : "（尚未按当前选项拉取）"}
              </div>
              <button
                type="button"
                disabled={previewing}
                onClick={loadPreview}
                className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
              >
                {previewing ? "拉取中…" : "按当前选项拉取名单"}
              </button>
            </div>
            {previewStale && preview !== null ? (
              <p className="text-xs text-amber-700">选项已变更，请重新拉取名单后再创建。</p>
            ) : null}
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-50 text-sm min-h-[3rem]">
              {preview === null || previewStale ? (
                <li className="px-3 py-3 text-slate-400">
                  先选好销售与条数，再点上方「按当前选项拉取名单」。
                </li>
              ) : preview.length === 0 ? (
                <li className="px-3 py-2 text-slate-400">无匹配记录</li>
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
            取消
          </button>
          <button
            type="button"
            disabled={pending || previewing || previewStale || preview === null}
            onClick={submit}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-40"
          >
            {pending ? "创建中…" : "创建会议"}
          </button>
        </div>
      </div>
    </div>
  );
}
