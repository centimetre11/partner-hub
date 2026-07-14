"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import type {
  WeeklyReportSnapshotDetail,
  WeeklyReportSnapshotListItem,
} from "@/lib/weekly-report-actions";

function kindTone(kind: string): "blue" | "indigo" | "zinc" {
  if (kind === "MANAGER_DIGEST") return "indigo";
  if (kind === "PERSONAL") return "blue";
  return "zinc";
}

function sourceTone(source: string): "green" | "amber" | "zinc" {
  if (source === "SCHEDULED") return "green";
  if (source === "TEST") return "amber";
  return "zinc";
}

function buildHref(opts: { id?: string | null }) {
  if (!opts.id) return "/ops/weekly-report";
  const params = new URLSearchParams();
  params.set("id", opts.id);
  return `/ops/weekly-report?${params.toString()}`;
}

export function WeeklyReportHistory({
  items,
  selected,
  labels,
}: {
  items: WeeklyReportSnapshotListItem[];
  selected: WeeklyReportSnapshotDetail | null;
  labels: {
    empty: string;
    emptyHint: string;
    personal: string;
    managerDigest: string;
    sourceScheduled: string;
    sourceManual: string;
    sourceTest: string;
    backToList: string;
    week: string;
    generatedAt: string;
    open: string;
  };
}) {
  function kindLabel(kind: string) {
    if (kind === "MANAGER_DIGEST") return labels.managerDigest;
    if (kind === "PERSONAL") return labels.personal;
    return kind;
  }

  function sourceLabel(source: string) {
    if (source === "SCHEDULED") return labels.sourceScheduled;
    if (source === "MANUAL") return labels.sourceManual;
    if (source === "TEST") return labels.sourceTest;
    return source;
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={kindTone(selected.kind)}>{kindLabel(selected.kind)}</Badge>
              <Badge tone={sourceTone(selected.source)}>{sourceLabel(selected.source)}</Badge>
            </div>
            <h2 className="text-base font-semibold text-slate-900 break-words">{selected.subject}</h2>
            <p className="text-xs text-slate-500">
              {labels.week} {selected.weekLabel}
              {selected.userName ? ` · ${selected.userName}` : ""}
              {" · "}
              {labels.generatedAt}{" "}
              {new Date(selected.createdAt).toLocaleString("zh-CN", { hour12: false })}
            </p>
          </div>
          <Link
            href={buildHref({})}
            className="text-sm text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline shrink-0"
          >
            {labels.backToList}
          </Link>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <iframe
            title={selected.subject}
            srcDoc={selected.html}
            sandbox=""
            className="w-full min-h-[70vh] bg-white"
          />
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium text-slate-800">{labels.empty}</p>
        <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white overflow-hidden">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={buildHref({ id: item.id })}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Badge tone={kindTone(item.kind)}>{kindLabel(item.kind)}</Badge>
              <Badge tone={sourceTone(item.source)}>{sourceLabel(item.source)}</Badge>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 truncate">{item.subject}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {labels.week} {item.weekLabel}
                {item.userName ? ` · ${item.userName}` : ""}
                {" · "}
                {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
              </div>
            </div>
            <span className="text-xs text-slate-500 shrink-0">{labels.open}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
