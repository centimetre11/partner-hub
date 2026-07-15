"use client";

import { useMemo } from "react";
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

type WeekGroup = {
  weekLabel: string;
  digests: WeeklyReportSnapshotListItem[];
  personals: WeeklyReportSnapshotListItem[];
  latestAt: number;
};

function groupByWeek(items: WeeklyReportSnapshotListItem[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const item of items) {
    const key = item.weekLabel || "—";
    let g = map.get(key);
    if (!g) {
      g = { weekLabel: key, digests: [], personals: [], latestAt: 0 };
      map.set(key, g);
    }
    if (item.kind === "MANAGER_DIGEST") g.digests.push(item);
    else g.personals.push(item);
    const t = new Date(item.createdAt).getTime();
    if (t > g.latestAt) g.latestAt = t;
  }
  for (const g of map.values()) {
    g.personals.sort((a, b) => (a.userName ?? a.subject).localeCompare(b.userName ?? b.subject, "zh"));
    g.digests.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  return [...map.values()].sort((a, b) => b.latestAt - a.latestAt);
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
    personalSection: string;
    membersCount: string;
    localeEn: string;
    localeZh: string;
    sameWeek: string;
  };
}) {
  const groups = useMemo(() => groupByWeek(items), [items]);

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

  function localeLabel(locale: string) {
    if (locale === "en") return labels.localeEn;
    if (locale === "zh") return labels.localeZh;
    return locale;
  }

  if (selected) {
    const siblings = items
      .filter((i) => i.weekLabel === selected.weekLabel && i.id !== selected.id)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "MANAGER_DIGEST" ? -1 : 1;
        return (a.userName ?? "").localeCompare(b.userName ?? "", "zh");
      });
    const title =
      selected.kind === "PERSONAL" && selected.userName
        ? `${selected.userName} · ${labels.personal}`
        : selected.subject;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={kindTone(selected.kind)}>{kindLabel(selected.kind)}</Badge>
              <Badge tone={sourceTone(selected.source)}>{sourceLabel(selected.source)}</Badge>
              <Badge tone="zinc">{localeLabel(selected.locale)}</Badge>
            </div>
            <h2 className="text-base font-semibold text-slate-900 break-words">{title}</h2>
            <p className="text-xs text-slate-500">
              {labels.week} {selected.weekLabel}
              {" · "}
              {labels.generatedAt}{" "}
              {new Date(selected.createdAt).toLocaleString("zh-CN", { hour12: false })}
            </p>
            {selected.kind === "PERSONAL" && selected.subject !== title && (
              <p className="text-xs text-slate-400 truncate">{selected.subject}</p>
            )}
          </div>
          <Link
            href={buildHref({})}
            className="text-sm text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline shrink-0"
          >
            {labels.backToList}
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 sm:p-3">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
            <iframe
              title={selected.subject}
              srcDoc={selected.html}
              sandbox=""
              className="w-full min-h-[72vh] bg-white"
            />
          </div>
        </div>

        {siblings.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500">
              {labels.sameWeek} · {selected.weekLabel}
            </div>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link
                  key={s.id}
                  href={buildHref({ id: s.id })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                >
                  <span
                    className={
                      s.kind === "MANAGER_DIGEST" ? "text-indigo-600" : "text-blue-600"
                    }
                  >
                    {s.kind === "MANAGER_DIGEST" ? labels.managerDigest : s.userName || labels.personal}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
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
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.weekLabel} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {labels.week} {g.weekLabel}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {labels.membersCount.replace("{n}", String(g.personals.length))}
                {g.digests.length ? ` · ${labels.managerDigest}` : ""}
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {new Date(g.latestAt).toLocaleString("zh-CN", { hour12: false })}
            </div>
          </header>

          <div className="p-3 sm:p-4 space-y-4">
            {g.digests.map((d) => (
              <Link
                key={d.id}
                href={buildHref({ id: d.id })}
                className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-3 hover:bg-indigo-50 transition-colors"
              >
                <Badge tone="indigo">{labels.managerDigest}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">{d.subject}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {sourceLabel(d.source)} · {localeLabel(d.locale)}
                  </div>
                </div>
                <span className="text-xs text-indigo-700 shrink-0">{labels.open}</span>
              </Link>
            ))}

            {g.personals.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500 px-0.5">{labels.personalSection}</div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {g.personals.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={buildHref({ id: p.id })}
                        className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 hover:border-slate-300 hover:bg-slate-50 transition-colors h-full"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                          {(p.userName || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {p.userName || labels.personal}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                            <Badge tone={sourceTone(p.source)}>{sourceLabel(p.source)}</Badge>
                            {p.locale === "en" && <Badge tone="zinc">{labels.localeEn}</Badge>}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{labels.open}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
