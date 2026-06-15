"use client";

import { useState, useTransition } from "react";
import { Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import {
  MONITOR_DIMENSION_LABELS,
  MONITOR_DIMENSIONS,
  MONITOR_SENTIMENT_LABELS,
  MONITOR_SENTIMENT_TONE,
  MONITOR_SOURCE_TYPE_LABELS,
} from "@/lib/constants";
import {
  addMonitorSourceAction,
  archiveMonitorItemAction,
  deleteMonitorSourceAction,
  runSentimentScanAction,
  setPartnerMonitorDimsAction,
  toggleMonitorSourceAction,
} from "@/lib/monitor-actions";

export type MonitorSourceRow = {
  id: string;
  label: string;
  url: string;
  sourceType: string;
  domain: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  enabled: boolean;
};

export type MonitorItemRow = {
  id: string;
  dimension: string;
  sentiment: string;
  title: string;
  summary: string | null;
  url: string | null;
  sourceName: string | null;
  publishedAt: Date | string | null;
  createdAt: Date | string;
};

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const ALL_KEY = "__all__";

export function SentimentMonitorSection({
  partnerId,
  sources,
  items,
  selectedDims,
}: {
  partnerId: string;
  sources: MonitorSourceRow[];
  items: MonitorItemRow[];
  selectedDims: string[];
}) {
  const [dims, setDims] = useState<string[]>(selectedDims);
  const [sentFilter, setSentFilter] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanningDim, setScanningDim] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [savingDims, startDimTransition] = useTransition();

  function toggleDim(d: string) {
    const next = dims.includes(d) ? dims.filter((x) => x !== d) : [...dims, d];
    setDims(next);
    startDimTransition(() => setPartnerMonitorDimsAction(partnerId, next));
  }

  function runScan(targetDims: string[] | null, dimKey: string) {
    setScanMsg(null);
    setScanningDim(dimKey);
    startTransition(async () => {
      try {
        const r = await runSentimentScanAction(partnerId, targetDims ?? undefined);
        if (!r.ok) {
          setScanMsg(r.error ?? "扫描失败");
        } else if (r.error && r.created === 0) {
          setScanMsg(r.error);
        } else {
          const label = dimKey === ALL_KEY ? "" : `「${MONITOR_DIMENSION_LABELS[dimKey] ?? dimKey}」`;
          setScanMsg(
            r.created > 0
              ? `${label}本次新增 ${r.created} 条舆情（扫描 ${r.scanned} 个信息源）`
              : `${label}本次无新发现（扫描 ${r.scanned} 个信息源）`,
          );
        }
      } finally {
        setScanningDim(null);
      }
    });
  }

  // 按维度分组
  const itemsByDim = new Map<string, MonitorItemRow[]>();
  for (const it of items) {
    const arr = itemsByDim.get(it.dimension) ?? [];
    arr.push(it);
    itemsByDim.set(it.dimension, arr);
  }
  // 展示的分区 = 已订阅维度 ∪ 有结果的维度，按固定维度顺序
  const visibleDims = MONITOR_DIMENSIONS.filter((d) => dims.includes(d) || itemsByDim.has(d));
  const scanning = scanningDim !== null;

  return (
    <Card
      title={`⑥ 舆情监控（${items.length}）`}
      actions={
        <button
          onClick={() => runScan(dims, ALL_KEY)}
          disabled={scanning || dims.length === 0}
          title={dims.length === 0 ? "请先勾选要监控的维度" : "扫描所有已勾选维度"}
          className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {scanningDim === ALL_KEY ? "扫描中…" : "📡 立即扫描"}
        </button>
      }
    >
      {scanMsg && (
        <div className="mb-4 rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 text-xs text-zinc-600">
          {scanMsg}
        </div>
      )}

      {/* 维度多选（订阅） */}
      <div className="mb-5">
        <div className="text-xs text-zinc-400 mb-2">
          选择要监控的维度（默认不选，按需勾选）
          {savingDims && <span className="ml-2 text-zinc-300">保存中…</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MONITOR_DIMENSIONS.map((d) => {
            const on = dims.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggleDim(d)}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  on
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-zinc-500 border-zinc-200 hover:border-indigo-300"
                }`}
              >
                {MONITOR_DIMENSION_LABELS[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 自定义监控链接源 */}
      <div className="mb-5 pb-5 border-b border-zinc-100">
        <div className="text-xs text-zinc-400 mb-2">
          监控链接源（领英 / Facebook 主页 / 官网 / 新闻源…）
          <span className="block mt-0.5 text-zinc-300">
            领英链接：需配置 NINJAPEARL_API_KEY，且伙伴档案填写官网；将按官网拉取博客 / X 等公开更新（不直接抓领英帖子）
          </span>
        </div>
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2">
              {s.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumbnailUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center text-xs text-zinc-400 shrink-0">
                  {MONITOR_SOURCE_TYPE_LABELS[s.sourceType]?.slice(0, 1) ?? "链"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-zinc-800 hover:text-indigo-600 truncate"
                  >
                    {s.label}
                  </a>
                  <Badge tone="zinc">{MONITOR_SOURCE_TYPE_LABELS[s.sourceType] ?? s.sourceType}</Badge>
                </div>
                <div className="text-xs text-zinc-400 truncate">{s.url}</div>
              </div>
              <form action={toggleMonitorSourceAction.bind(null, partnerId, s.id)}>
                <button
                  className={`text-xs px-2 py-1 rounded-md ${
                    s.enabled ? "text-emerald-600 hover:bg-emerald-50" : "text-zinc-400 hover:bg-zinc-50"
                  }`}
                  title={s.enabled ? "已启用，点击停用" : "已停用，点击启用"}
                >
                  {s.enabled ? "● 启用" : "○ 停用"}
                </button>
              </form>
              <form action={deleteMonitorSourceAction.bind(null, partnerId, s.id)}>
                <button className="text-zinc-300 hover:text-red-500 text-sm px-1" title="删除">
                  ✕
                </button>
              </form>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="text-xs text-zinc-400">
              还没有自定义监控源。添加领英主页后，扫描会通过 NinjaPear 按伙伴官网抓取公开动态（需填写官网 + API Key）。
            </p>
          )}
        </div>

        <details className="mt-2 rounded-lg border border-dashed border-zinc-200">
          <summary className="px-3 py-2 text-sm text-indigo-600 cursor-pointer list-none">+ 添加监控链接</summary>
          <form
            action={addMonitorSourceAction.bind(null, partnerId)}
            className="px-3 pb-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm"
          >
            <input name="url" required placeholder="链接 URL *（如领英/Facebook 主页）" className={`${input} md:col-span-2`} />
            <input name="label" placeholder="备注名（可选）" className={input} />
            <div className="md:col-span-3 flex justify-end">
              <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700">
                添加
              </button>
            </div>
          </form>
        </details>
      </div>

      {/* 情感筛选 */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <button
            onClick={() => setSentFilter(null)}
            className={`text-xs px-2 py-0.5 rounded-md border ${
              !sentFilter ? "border-zinc-400 text-zinc-700" : "border-zinc-200 text-zinc-400"
            }`}
          >
            全部情感
          </button>
          {Object.keys(MONITOR_SENTIMENT_LABELS).map((s) => (
            <button
              key={s}
              onClick={() => setSentFilter(sentFilter === s ? null : s)}
              className={`text-xs px-2 py-0.5 rounded-md border ${
                sentFilter === s ? "border-zinc-400" : "border-zinc-200"
              }`}
            >
              <Badge tone={MONITOR_SENTIMENT_TONE[s]}>{MONITOR_SENTIMENT_LABELS[s]}</Badge>
            </button>
          ))}
        </div>
      )}

      {/* 按维度分区 */}
      {visibleDims.length === 0 ? (
        <EmptyState text="请先在上方勾选要监控的维度，或添加监控链接源，然后点「立即扫描」。" />
      ) : (
        <div className="space-y-3">
          {visibleDims.map((d) => {
            const dimItems = (itemsByDim.get(d) ?? []).filter((it) => !sentFilter || it.sentiment === sentFilter);
            const total = itemsByDim.get(d)?.length ?? 0;
            return (
              <details key={d} open={total > 0} className="group rounded-lg border border-zinc-100">
                <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer list-none">
                  <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
                  <span className="text-sm font-medium text-zinc-800">{MONITOR_DIMENSION_LABELS[d]}</span>
                  <Badge tone="zinc">{total}</Badge>
                  {!dims.includes(d) && <span className="text-[10px] text-zinc-300">未订阅</span>}
                  <span className="flex-1" />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      runScan([d], d);
                    }}
                    disabled={scanning}
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
                  >
                    {scanningDim === d ? "扫描中…" : "扫描"}
                  </button>
                </summary>
                <div className="px-4 pb-3 pt-1 space-y-2.5 border-t border-zinc-50">
                  {dimItems.map((it) => (
                    <div key={it.id} className="group/item rounded-lg border border-zinc-100 px-3 py-2.5 hover:border-zinc-200">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <Badge tone={MONITOR_SENTIMENT_TONE[it.sentiment] ?? "zinc"}>
                              {MONITOR_SENTIMENT_LABELS[it.sentiment] ?? it.sentiment}
                            </Badge>
                            {it.url ? (
                              <a
                                href={it.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-medium text-zinc-800 hover:text-indigo-600"
                              >
                                {it.title}
                              </a>
                            ) : (
                              <span className="text-sm font-medium text-zinc-800">{it.title}</span>
                            )}
                          </div>
                          {it.summary && <p className="text-xs text-zinc-600 leading-relaxed">{it.summary}</p>}
                          <div className="text-xs text-zinc-400 mt-1">
                            {it.sourceName && `${it.sourceName} · `}
                            {fmtDate(it.publishedAt ?? it.createdAt)}
                          </div>
                        </div>
                        <form action={archiveMonitorItemAction.bind(null, partnerId, it.id)}>
                          <button
                            title="归档"
                            className="text-zinc-300 hover:text-zinc-600 text-xs opacity-60 group-hover/item:opacity-100"
                          >
                            归档
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                  {total === 0 && <p className="text-xs text-zinc-400 py-1">未扫描，点右上「扫描」联网抓取该维度。</p>}
                  {total > 0 && dimItems.length === 0 && <p className="text-xs text-zinc-400 py-1">当前情感筛选下无结果</p>}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}
