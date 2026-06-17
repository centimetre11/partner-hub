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

type ScanStepStatus = "ok" | "skip" | "fail" | "warn";

type ScanStep = {
  label: string;
  status: ScanStepStatus;
  detail?: string;
  preview?: string;
};

type ScanMeta = {
  searchBackend?: string;
  classified?: number;
  rawChars?: number;
  created?: number;
  scanned?: number;
};

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const ALL_KEY = "__all__";

const STEP_ICON: Record<ScanStepStatus, string> = {
  ok: "✓",
  warn: "!",
  fail: "✕",
  skip: "–",
};

const STEP_TONE: Record<ScanStepStatus, string> = {
  ok: "text-emerald-600 bg-emerald-50",
  warn: "text-amber-600 bg-amber-50",
  fail: "text-red-600 bg-red-50",
  skip: "text-zinc-400 bg-zinc-100",
};

function buildPlannedSteps(
  dims: string[],
  sources: MonitorSourceRow[],
  dimKey: string,
): ScanStep[] {
  const targetDims = dimKey === ALL_KEY ? dims : [dimKey];
  const enabled = sources.filter((s) => s.enabled);
  const steps: ScanStep[] = [
    { label: "Prepare", status: "ok", detail: "Connecting to server, checking network config…" },
  ];
  for (const d of targetDims) {
    steps.push({
      label: `Search · ${MONITOR_DIMENSION_LABELS[d] ?? d}`,
      status: "ok",
      detail: "Searching online…",
    });
  }
  if (targetDims.length > 0) {
    steps.push({ label: "Supplement · Broad search", status: "ok", detail: "Auto-triggered when dimension results are sparse" });
  }
  for (const s of enabled) {
    steps.push({ label: `Source · ${s.label}`, status: "ok", detail: s.url });
  }
  steps.push(
    { label: "AI classification", status: "ok", detail: "Extracting structured sentiment…" },
    { label: "Deduplicate & save", status: "ok", detail: "Writing to database…" },
  );
  return steps;
}

function ScanProgressPanel({
  scanning,
  steps,
  meta,
  scanMsg,
  onScan,
  canScan,
  scanLabel,
  partnerName,
}: {
  scanning: boolean;
  steps: ScanStep[] | null;
  meta: ScanMeta | null;
  scanMsg: string | null;
  onScan: () => void;
  canScan: boolean;
  scanLabel: string;
  partnerName?: string;
}) {
  const showSteps = steps && steps.length > 0;
  return (
    <div className="mb-5 rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/80 to-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-indigo-100/80">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-800">
            Scan progress{partnerName ? ` · ${partnerName}` : ""}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {scanning
              ? "Searching online and analyzing, please wait…"
              : meta?.searchBackend
                ? `Search backend: ${meta.searchBackend}`
                : "Click the button on the right to start scanning; step details will appear below"}
          </div>
        </div>
        <button
          onClick={onScan}
          disabled={scanning || !canScan}
          title={!canScan ? "Please select dimensions to monitor first" : "Scan all selected dimensions"}
          className="shrink-0 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {scanning ? "Scanning…" : scanLabel}
        </button>
      </div>

      {scanMsg && (
        <div className="mx-4 mt-3 rounded-lg bg-white border border-zinc-100 px-3 py-2 text-xs text-zinc-700">
          {scanMsg}
          {meta && (meta.rawChars !== undefined || meta.classified !== undefined) && (
            <span className="text-zinc-400 ml-2">
              · Fetched {meta.rawChars ?? 0} chars · Classified {meta.classified ?? 0} · Saved {meta.created ?? 0}
            </span>
          )}
        </div>
      )}

      {showSteps && (
        <ol className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
          {steps!.map((st, i) => (
            <li key={`${st.label}-${i}`} className="flex gap-2.5 text-xs">
              <span
                className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${STEP_TONE[st.status]}`}
              >
                {scanning && i === steps!.length - 1 ? "…" : STEP_ICON[st.status]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-700">{st.label}</div>
                {st.detail && <div className="text-zinc-500 mt-0.5 break-words">{st.detail}</div>}
                {st.preview && (
                  <div className="mt-1 rounded-md bg-zinc-50 border border-zinc-100 px-2 py-1.5 text-zinc-500 leading-relaxed">
                    {st.preview}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {scanning && !showSteps && (
        <div className="px-4 py-6 text-center text-xs text-indigo-500 animate-pulse">Initializing scan task…</div>
      )}
    </div>
  );
}

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

export function SentimentMonitorSection({
  partnerId,
  partnerName,
  partnerWebsite,
  sources,
  items,
  selectedDims,
}: {
  partnerId: string;
  partnerName?: string;
  partnerWebsite?: string | null;
  sources: MonitorSourceRow[];
  items: MonitorItemRow[];
  selectedDims: string[];
}) {
  const [dims, setDims] = useState<string[]>(selectedDims);
  const [sentFilter, setSentFilter] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanSteps, setScanSteps] = useState<ScanStep[] | null>(null);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
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
    setScanMeta(null);
    setScanSteps(buildPlannedSteps(targetDims ?? dims, sources, dimKey));
    setScanningDim(dimKey);
    startTransition(async () => {
      try {
        const r = await runSentimentScanAction(partnerId, targetDims ?? undefined);
        setScanSteps(r.steps ?? null);
        setScanMeta({
          searchBackend: r.searchBackend,
          classified: r.classified,
          rawChars: r.rawChars,
          created: r.created,
          scanned: r.scanned,
        });
        if (!r.ok) {
          setScanMsg(r.error ?? "Scan failed");
        } else if (r.error && r.created === 0) {
          setScanMsg(r.error);
        } else {
          const label = dimKey === ALL_KEY ? "" : `"${MONITOR_DIMENSION_LABELS[dimKey] ?? dimKey}" `;
          setScanMsg(
            r.created > 0
              ? `${label}Added ${r.created} new sentiment item(s) (${r.scanned} source block(s))`
              : `${label}No new findings (${r.scanned} source block(s), classified ${r.classified ?? 0})`,
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
    <Card title={`⑥ Sentiment Monitor (${items.length})`}>
      <ScanProgressPanel
        scanning={scanning}
        steps={scanSteps}
        meta={scanMeta}
        scanMsg={scanMsg}
        onScan={() => runScan(dims, ALL_KEY)}
        canScan={dims.length > 0}
        scanLabel="📡 Scan now"
        partnerName={partnerName}
      />

      {/* 维度多选（订阅） */}
      <div className="mb-5">
        <div className="text-xs text-zinc-400 mb-2">
          Select dimensions to monitor (none selected by default; check as needed)
          {savingDims && <span className="ml-2 text-zinc-300">Saving…</span>}
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
          Monitor link sources (LinkedIn / Facebook page / website / news…)
          <span className="block mt-0.5 text-zinc-300">
            LinkedIn links: requires NINJAPEARL_API_KEY and partner website in profile (current:
            {partnerWebsite?.trim() ? partnerWebsite : "not set"}
            ); fetches public updates from blog / X etc. via website
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
                  {MONITOR_SOURCE_TYPE_LABELS[s.sourceType]?.slice(0, 1) ?? "L"}
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
                  title={s.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                >
                  {s.enabled ? "● On" : "○ Off"}
                </button>
              </form>
              <form action={deleteMonitorSourceAction.bind(null, partnerId, s.id)}>
                <button className="text-zinc-300 hover:text-red-500 text-sm px-1" title="Delete">
                  ✕
                </button>
              </form>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="text-xs text-zinc-400">
              No custom monitor sources yet. After adding a LinkedIn page, scans will fetch public updates via NinjaPear using the partner website (requires website + API key).
            </p>
          )}
        </div>

        <details className="mt-2 rounded-lg border border-dashed border-zinc-200">
          <summary className="px-3 py-2 text-sm text-indigo-600 cursor-pointer list-none">+ Add monitor link</summary>
          <form
            action={addMonitorSourceAction.bind(null, partnerId)}
            className="px-3 pb-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm"
          >
            <input name="url" required placeholder="Link URL * (e.g. LinkedIn/Facebook page)" className={`${input} md:col-span-2`} />
            <input name="label" placeholder="Label (optional)" className={input} />
            <div className="md:col-span-3 flex justify-end">
              <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700">
                Add
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
            All sentiments
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
        <EmptyState text='Select dimensions to monitor above, or add monitor link sources, then click "Scan now".' />
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
                  {!dims.includes(d) && <span className="text-[10px] text-zinc-300">Not subscribed</span>}
                  <span className="flex-1" />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      runScan([d], d);
                    }}
                    disabled={scanning}
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
                  >
                    {scanningDim === d ? "Scanning…" : "Scan"}
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
                            title="Archive"
                            className="text-zinc-300 hover:text-zinc-600 text-xs opacity-60 group-hover/item:opacity-100"
                          >
                            Archive
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                  {total === 0 && <p className="text-xs text-zinc-400 py-1">Not scanned yet — click \"Scan\" above to fetch this dimension online.</p>}
                  {total > 0 && dimItems.length === 0 && <p className="text-xs text-zinc-400 py-1">No results for current sentiment filter</p>}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}
