"use client";

import { useMemo, useState, useTransition } from "react";
import { setPartnerStatusOverrideAction } from "@/lib/actions";
import {
  STATUS_DIMENSION_KEYS,
  type DimensionStatus,
  type PartnerStatusOverview as Overview,
  type StatusDimensionKey,
  type StatusLevel,
} from "@/lib/partner-status";
import { useMessages } from "@/lib/i18n/context";
import { Badge, Card, ScoreBar } from "@/components/ui";

const LEVEL_TONE: Record<StatusLevel, string> = {
  0: "bg-slate-100 text-slate-600 border-slate-200",
  1: "bg-amber-50 text-amber-800 border-amber-200",
  2: "bg-sky-50 text-sky-800 border-sky-200",
  3: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

const LEVEL_BAR: Record<StatusLevel, string> = {
  0: "bg-slate-300",
  1: "bg-amber-400",
  2: "bg-sky-500",
  3: "bg-emerald-500",
};

function LevelPips({ level }: { level: StatusLevel }) {
  return (
    <div className="flex gap-0.5 mt-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full ${i <= level ? LEVEL_BAR[level] : "bg-slate-100"}`}
        />
      ))}
    </div>
  );
}

export function PartnerStatusOverview({
  partnerId,
  overview,
}: {
  partnerId: string;
  overview: Overview;
}) {
  const m = useMessages().partnerStatus;
  const [expanded, setExpanded] = useState<StatusDimensionKey | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftLevel, setDraftLevel] = useState<string>("auto");
  const [draftNote, setDraftNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const byKey = useMemo(() => {
    const map = new Map<StatusDimensionKey, DimensionStatus>();
    for (const d of overview.dimensions) map.set(d.key, d);
    return map;
  }, [overview.dimensions]);

  function openDim(key: StatusDimensionKey) {
    const d = byKey.get(key);
    if (!d) return;
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    setDraftLevel(d.isOverridden ? String(d.overrideLevel) : "auto");
    setDraftNote(d.note ?? "");
    setError(null);
  }

  function save(key: StatusDimensionKey) {
    setError(null);
    const level: number | null = draftLevel === "auto" ? null : Number(draftLevel);
    startTransition(async () => {
      const res = await setPartnerStatusOverrideAction(partnerId, key, level, draftNote);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setExpanded(null);
    });
  }

  const bottleneckLabels = overview.bottlenecks
    .map((k) => m.dimensions[k])
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      title={m.title}
      actions={
        <div className="flex items-center gap-3">
          <div className="hidden sm:block min-w-[120px]">
            <ScoreBar score={overview.healthScore} />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {m.healthScore} {overview.healthScore}
          </span>
        </div>
      }
    >
      <p className="text-xs text-slate-500 mb-3">{m.subtitle}</p>
      {bottleneckLabels && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5 mb-3">
          {m.bottlenecks}：{bottleneckLabels}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
        {STATUS_DIMENSION_KEYS.map((key) => {
          const d = byKey.get(key)!;
          const active = expanded === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => openDim(key)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-slate-700 bg-slate-900 text-white"
                  : `${LEVEL_TONE[d.effectiveLevel]} hover:brightness-[0.98]`
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={`text-xs font-semibold leading-snug ${active ? "text-white" : ""}`}>
                  {m.dimensions[key]}
                </span>
                {d.isOverridden && (
                  <Badge tone={active ? "zinc" : "purple"}>{m.manual}</Badge>
                )}
              </div>
              <div className={`mt-1.5 text-sm font-semibold tabular-nums ${active ? "text-white" : ""}`}>
                {m.levelLabel.replace("{n}", String(d.effectiveLevel))}
                <span className={`ml-1 text-[11px] font-normal ${active ? "text-slate-300" : "opacity-70"}`}>
                  {m.levelNames[d.effectiveLevel]}
                </span>
              </div>
              {!active && <LevelPips level={d.effectiveLevel} />}
            </button>
          );
        })}
      </div>

      {expanded && byKey.get(expanded) && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
          {(() => {
            const d = byKey.get(expanded)!;
            return (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">{m.dimensions[d.key]}</h4>
                  <Badge tone="zinc">
                    {m.autoLevelHint.replace("{n}", String(d.autoLevel))} · {m.levelNames[d.autoLevel]}
                  </Badge>
                  {d.isOverridden && <Badge tone="purple">{m.manual}</Badge>}
                </div>

                <div>
                  <p className="text-[11px] font-medium text-slate-500 mb-1">{m.evidence}</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {d.evidence.map((e) => (
                      <li key={e} className="text-xs text-slate-700">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-slate-500 mb-1">{m.suggestedNext}</p>
                  <p className="text-xs text-slate-800">{d.suggestedNext}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="block">
                    <span className="text-[11px] font-medium text-slate-500">{m.level}</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      value={draftLevel}
                      onChange={(e) => setDraftLevel(e.target.value)}
                      disabled={pending}
                    >
                      <option value="auto">
                        {m.levelAuto}（L{d.autoLevel}）
                      </option>
                      {([0, 1, 2, 3] as StatusLevel[]).map((lv) => (
                        <option key={lv} value={String(lv)}>
                          {m.levelLabel.replace("{n}", String(lv))} · {m.levelNames[lv]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="text-[11px] font-medium text-slate-500">{m.note}</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder={m.notePlaceholder}
                      disabled={pending}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save(d.key)}
                    className="rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {pending ? m.saving : m.save}
                  </button>
                  {d.isOverridden && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setDraftLevel("auto");
                        startTransition(async () => {
                          await setPartnerStatusOverrideAction(partnerId, d.key, null, null);
                          setExpanded(null);
                        });
                      }}
                      className="rounded-lg border border-slate-200 bg-white text-xs font-medium px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {m.clearOverride}
                    </button>
                  )}
                  {error && <span className="text-xs text-red-600">{error}</span>}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </Card>
  );
}
