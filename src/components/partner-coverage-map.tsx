"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  buildCoverageMatrix,
  countPartnersByStage,
  coverageCellTone,
  type CoverageAxisPair,
  type CoverageCell,
  type CoverageGapItem,
  type CoveragePartnerInput,
  type PipelineStage,
} from "@/lib/partner-coverage";
import { TierBadge } from "@/components/ui";

export type PipelineStageMeta = {
  stage: PipelineStage;
  name: string;
  desc: string;
};

export type PartnerCoverageCopy = {
  pairRegionIndustry: string;
  pairRegionCapability: string;
  pairIndustryCapability: string;
  gapsTitle: string;
  shallowTitle: string;
  gapsEmpty: string;
  shallowEmpty: string;
  legendTitle: string;
  legendGap: string;
  legendStage1: string;
  legendStage2: string;
  legendStage3: string;
  gapsOnly: string;
  partnersInCell: string;
  noPartnersInCell: string;
  clickCellHint: string;
  gapRegion: string;
  gapCapability: string;
  gapIndustry: string;
  shallowCell: string;
  shallowRegion: string;
  shallowCapability: string;
  shallowIndustry: string;
  noneIndustry: string;
  noneCapability: string;
  showAllRegions: string;
  hideEmptyRegions: string;
  stageFilterHint: string;
  stageOf: string;
};

const PAIRS: { key: CoverageAxisPair; labelKey: keyof PartnerCoverageCopy }[] = [
  { key: "region-industry", labelKey: "pairRegionIndustry" },
  { key: "region-capability", labelKey: "pairRegionCapability" },
  { key: "industry-capability", labelKey: "pairIndustryCapability" },
];

function gapKindLabel(item: CoverageGapItem, copy: PartnerCoverageCopy) {
  if (item.kind === "region") return copy.gapRegion.replace("{label}", item.label);
  if (item.kind === "capability") return copy.gapCapability.replace("{label}", item.label);
  if (item.kind === "industry") return copy.gapIndustry.replace("{label}", item.label);
  return item.label;
}

function shallowKindLabel(item: CoverageGapItem, copy: PartnerCoverageCopy) {
  if (item.kind === "cell") {
    return copy.shallowCell
      .replace("{row}", item.label)
      .replace("{col}", item.colLabel ?? "");
  }
  if (item.kind === "region") return copy.shallowRegion.replace("{label}", item.label);
  if (item.kind === "capability") return copy.shallowCapability.replace("{label}", item.label);
  if (item.kind === "industry") return copy.shallowIndustry.replace("{label}", item.label);
  return item.label;
}

function stageCardTone(stage: PipelineStage, active: boolean) {
  if (stage === 1) {
    return active
      ? "border-amber-400 bg-amber-50/80 ring-2 ring-amber-200"
      : "border-amber-200/80 bg-amber-50/40 hover:bg-amber-50/70";
  }
  if (stage === 2) {
    return active
      ? "border-sky-400 bg-sky-50/80 ring-2 ring-sky-200"
      : "border-sky-200/80 bg-sky-50/40 hover:bg-sky-50/70";
  }
  return active
    ? "border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200"
    : "border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50/70";
}

function stageBadgeTone(stage: PipelineStage) {
  if (stage === 1) return "bg-amber-600 text-white";
  if (stage === 2) return "bg-sky-600 text-white";
  return "bg-emerald-700 text-white";
}

export function PartnerCoverageMap({
  partners,
  locale,
  industryLabels,
  capabilityLabels,
  industryOrder,
  capabilityOrder,
  stages,
  copy,
}: {
  partners: CoveragePartnerInput[];
  locale: "zh" | "en";
  industryLabels: Record<string, string>;
  capabilityLabels: Record<string, string>;
  industryOrder: string[];
  capabilityOrder: string[];
  stages: PipelineStageMeta[];
  copy: PartnerCoverageCopy;
}) {
  const [pair, setPair] = useState<CoverageAxisPair>("region-capability");
  const [stageFilter, setStageFilter] = useState<PipelineStage | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [hideEmptyRegions, setHideEmptyRegions] = useState(true);
  const [selected, setSelected] = useState<CoverageCell | null>(null);

  const stageCounts = useMemo(() => countPartnersByStage(partners), [partners]);

  const matrix = useMemo(
    () =>
      buildCoverageMatrix(partners, pair, {
        locale,
        industryLabels,
        capabilityLabels,
        industryOrder,
        capabilityOrder,
        noneIndustryLabel: copy.noneIndustry,
        noneCapabilityLabel: copy.noneCapability,
        stageFilter,
      }),
    [
      partners,
      pair,
      locale,
      industryLabels,
      capabilityLabels,
      industryOrder,
      capabilityOrder,
      copy.noneIndustry,
      copy.noneCapability,
      stageFilter,
    ],
  );

  const visibleRowKeys = useMemo(() => {
    if (pair === "industry-capability" || !hideEmptyRegions) return matrix.rowKeys;
    return matrix.rowKeys.filter((rk) => {
      if (rk === "UNKNOWN") {
        return matrix.cells.some((c) => c.rowKey === rk && c.count > 0);
      }
      const hasAny = matrix.cells.some((c) => c.rowKey === rk && c.count > 0);
      if (hasAny) return true;
      return ["SAUDI_ARABIA", "UAE", "QATAR", "BAHRAIN", "KUWAIT", "OMAN", "EGYPT", "JORDAN"].includes(rk);
    });
  }, [matrix, pair, hideEmptyRegions]);

  const primaryGaps = matrix.gaps.filter((g) => g.kind === "region" || g.kind === "capability");
  const industryGaps = matrix.gaps.filter((g) => g.kind === "industry");
  const cellShallow = matrix.shallow.filter((g) => g.kind === "cell");
  const dimShallow = matrix.shallow.filter((g) => g.kind === "region" || g.kind === "capability");

  const stageName = (stage: PipelineStage) =>
    stages.find((s) => s.stage === stage)?.name ?? copy.stageOf.replace("{n}", String(stage));

  function onGapClick(g: CoverageGapItem) {
    if (g.kind === "cell") {
      const cell = matrix.cellMap.get(`${g.key}||${g.colKey}`);
      if (cell) setSelected(cell);
      return;
    }
    if (g.kind === "region") {
      if (pair === "industry-capability") {
        setPair("region-capability");
        setSelected(null);
        return;
      }
      const first = matrix.cells.find((c) => c.rowKey === g.key);
      if (first) setSelected(first);
      return;
    }
    if (g.kind === "capability") {
      if (pair === "region-industry") {
        setPair("region-capability");
        setSelected(null);
        return;
      }
      const first = matrix.cells.find((c) => c.colKey === g.key);
      if (first) setSelected(first);
      return;
    }
    if (g.kind === "industry") {
      if (pair === "region-capability") {
        setPair("region-industry");
        setSelected(null);
        return;
      }
      const first = matrix.cells.find((c) =>
        pair === "region-industry" ? c.colKey === g.key : c.rowKey === g.key,
      );
      if (first) setSelected(first);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {stages.map((s) => {
          const active = stageFilter === s.stage;
          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => {
                setStageFilter((prev) => (prev === s.stage ? null : s.stage));
                setSelected(null);
              }}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${stageCardTone(s.stage, active)}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${stageBadgeTone(s.stage)}`}
                >
                  {s.stage}
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                    <span className="text-sm tabular-nums text-slate-600">{stageCounts[s.stage]}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {stageFilter ? (
        <p className="text-xs text-slate-500">
          {copy.stageFilterHint.replace("{name}", stageName(stageFilter))}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {PAIRS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              setPair(p.key);
              setSelected(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm border transition-colors ${
              pair === p.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {copy[p.labelKey]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={gapsOnly}
            onChange={(e) => setGapsOnly(e.target.checked)}
            className="rounded border-slate-300"
          />
          {copy.gapsOnly}
        </label>
        {(pair === "region-industry" || pair === "region-capability") && (
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={hideEmptyRegions}
              onChange={(e) => setHideEmptyRegions(e.target.checked)}
              className="rounded border-slate-300"
            />
            {hideEmptyRegions ? copy.hideEmptyRegions : copy.showAllRegions}
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white border-b border-r border-slate-100 px-2 py-2 text-left text-slate-500 font-medium min-w-[88px]">
                  —
                </th>
                {matrix.colKeys.map((ck) => (
                  <th
                    key={ck}
                    className="border-b border-slate-100 px-1.5 py-2 text-center text-slate-600 font-medium min-w-[64px] max-w-[96px]"
                    title={matrix.colLabels[ck]}
                  >
                    <span className="line-clamp-2 leading-tight">{matrix.colLabels[ck]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRowKeys.map((rk) => (
                <tr key={rk}>
                  <th className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-2 py-1.5 text-left text-slate-700 font-medium whitespace-nowrap">
                    {matrix.rowLabels[rk]}
                  </th>
                  {matrix.colKeys.map((ck) => {
                    const cell = matrix.cellMap.get(`${rk}||${ck}`)!;
                    if (gapsOnly && !cell.isGap) {
                      return (
                        <td key={ck} className="border-b border-slate-50 p-1">
                          <div className="h-9 rounded-md bg-transparent" />
                        </td>
                      );
                    }
                    const active =
                      selected?.rowKey === cell.rowKey && selected?.colKey === cell.colKey;
                    const tipStage =
                      cell.bestStage != null ? ` · ${stageName(cell.bestStage)}` : "";
                    return (
                      <td key={ck} className="border-b border-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => setSelected(cell)}
                          className={`w-full h-9 rounded-md border text-xs font-medium tabular-nums transition-shadow ${coverageCellTone(cell)} ${
                            active ? "ring-2 ring-slate-900 ring-offset-1" : ""
                          }`}
                          title={`${matrix.rowLabels[rk]} × ${matrix.colLabels[ck]}: ${cell.count}${tipStage}`}
                        >
                          {cell.isGap ? "—" : cell.count}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="space-y-3">
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">{copy.legendTitle}</p>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: true, bestStage: null })}`} />
                {copy.legendGap}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestStage: 1 })}`} />
                {copy.legendStage1}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestStage: 2 })}`} />
                {copy.legendStage2}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestStage: 3 })}`} />
                {copy.legendStage3}
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">{copy.gapsTitle}</p>
            {primaryGaps.length === 0 && industryGaps.length === 0 ? (
              <p className="text-xs text-slate-400">{copy.gapsEmpty}</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {primaryGaps.map((g) => (
                  <li key={`${g.kind}-${g.key}`}>
                    <button
                      type="button"
                      className="text-left text-xs text-amber-800 hover:underline w-full"
                      onClick={() => onGapClick(g)}
                    >
                      {gapKindLabel(g, copy)}
                    </button>
                  </li>
                ))}
                {industryGaps.slice(0, 6).map((g) => (
                  <li key={`${g.kind}-${g.key}`}>
                    <span className="text-xs text-slate-500">{gapKindLabel(g, copy)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">{copy.shallowTitle}</p>
            {cellShallow.length === 0 && dimShallow.length === 0 ? (
              <p className="text-xs text-slate-400">{copy.shallowEmpty}</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {cellShallow.slice(0, 12).map((g) => (
                  <li key={`shallow-cell-${g.key}-${g.colKey}`}>
                    <button
                      type="button"
                      className="text-left text-xs text-amber-800 hover:underline w-full"
                      onClick={() => onGapClick(g)}
                    >
                      {shallowKindLabel(g, copy)}
                    </button>
                  </li>
                ))}
                {dimShallow.slice(0, 6).map((g) => (
                  <li key={`shallow-${g.kind}-${g.key}`}>
                    <button
                      type="button"
                      className="text-left text-xs text-slate-600 hover:underline w-full"
                      onClick={() => onGapClick(g)}
                    >
                      {shallowKindLabel(g, copy)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-3">
            {selected ? (
              <>
                <p className="text-xs font-medium text-slate-700 mb-1">
                  {matrix.rowLabels[selected.rowKey]} × {matrix.colLabels[selected.colKey]}
                </p>
                <p className="text-[11px] text-slate-400 mb-2">
                  {selected.isGap
                    ? copy.noPartnersInCell
                    : copy.partnersInCell.replace("{n}", String(selected.count))}
                  {selected.bestStage != null && !selected.isGap
                    ? ` · ${stageName(selected.bestStage)}`
                    : ""}
                </p>
                <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                  {selected.partners.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/partners/${p.id}`} className="text-sm text-sky-700 hover:underline truncate">
                        {p.name}
                      </Link>
                      <span className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${stageBadgeTone(p.pipelineStage)}`}
                        >
                          {stageName(p.pipelineStage)}
                        </span>
                        {p.tier ? <TierBadge tier={p.tier} /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-xs text-slate-400">{copy.clickCellHint}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
