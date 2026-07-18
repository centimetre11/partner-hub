"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  buildCoverageMatrix,
  coverageCellTone,
  type CoverageAxisPair,
  type CoverageCell,
  type CoverageGapItem,
  type CoveragePartnerInput,
} from "@/lib/partner-coverage";
import { TierBadge } from "@/components/ui";

export type PartnerCoverageCopy = {
  pairRegionIndustry: string;
  pairRegionCapability: string;
  pairIndustryCapability: string;
  gapsTitle: string;
  weakTitle: string;
  gapsEmpty: string;
  legendTitle: string;
  legendGap: string;
  legendUntiered: string;
  legendC: string;
  legendB: string;
  legendA: string;
  gapsOnly: string;
  partnersInCell: string;
  noPartnersInCell: string;
  clickCellHint: string;
  gapRegion: string;
  gapCapability: string;
  gapIndustry: string;
  noneIndustry: string;
  noneCapability: string;
  showAllRegions: string;
  hideEmptyRegions: string;
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

export function PartnerCoverageMap({
  partners,
  locale,
  industryLabels,
  capabilityLabels,
  industryOrder,
  capabilityOrder,
  copy,
}: {
  partners: CoveragePartnerInput[];
  locale: "zh" | "en";
  industryLabels: Record<string, string>;
  capabilityLabels: Record<string, string>;
  industryOrder: string[];
  capabilityOrder: string[];
  copy: PartnerCoverageCopy;
}) {
  const [pair, setPair] = useState<CoverageAxisPair>("region-capability");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [hideEmptyRegions, setHideEmptyRegions] = useState(true);
  const [selected, setSelected] = useState<CoverageCell | null>(null);

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
      }),
    [partners, pair, locale, industryLabels, capabilityLabels, industryOrder, capabilityOrder, copy.noneIndustry, copy.noneCapability],
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

  function onGapClick(g: CoverageGapItem) {
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
      const first = matrix.cells.find((c) =>
        pair === "industry-capability" ? c.colKey === g.key : c.colKey === g.key,
      );
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
                    return (
                      <td key={ck} className="border-b border-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => setSelected(cell)}
                          className={`w-full h-9 rounded-md border text-xs font-medium tabular-nums transition-shadow ${coverageCellTone(cell)} ${
                            active ? "ring-2 ring-slate-900 ring-offset-1" : ""
                          }`}
                          title={`${matrix.rowLabels[rk]} × ${matrix.colLabels[ck]}: ${cell.count}`}
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
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: true, bestTier: null, count: 0, isWeak: false, partners: [], rowKey: "", colKey: "" })}`} />
                {copy.legendGap}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestTier: null, count: 1, isWeak: true, partners: [], rowKey: "", colKey: "" })}`} />
                {copy.legendUntiered}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestTier: "C", count: 1, isWeak: true, partners: [], rowKey: "", colKey: "" })}`} />
                {copy.legendC}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestTier: "B", count: 1, isWeak: false, partners: [], rowKey: "", colKey: "" })}`} />
                {copy.legendB}
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-5 h-5 rounded border ${coverageCellTone({ isGap: false, bestTier: "A", count: 1, isWeak: false, partners: [], rowKey: "", colKey: "" })}`} />
                {copy.legendA}
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-3">
            <p className="text-xs font-medium text-slate-700 mb-2">{copy.gapsTitle}</p>
            {primaryGaps.length === 0 && industryGaps.length === 0 ? (
              <p className="text-xs text-slate-400">{copy.gapsEmpty}</p>
            ) : (
              <ul className="space-y-1 max-h-48 overflow-y-auto">
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

          {matrix.weak.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-3">
              <p className="text-xs font-medium text-slate-700 mb-2">{copy.weakTitle}</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {matrix.weak
                  .filter((g) => g.kind === "region" || g.kind === "capability")
                  .slice(0, 10)
                  .map((g) => (
                    <li key={`weak-${g.kind}-${g.key}`} className="text-xs text-slate-500">
                      {gapKindLabel(g, copy)}
                    </li>
                  ))}
              </ul>
            </div>
          )}

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
                </p>
                <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                  {selected.partners.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/partners/${p.id}`} className="text-sm text-sky-700 hover:underline truncate">
                        {p.name}
                      </Link>
                      {p.tier ? <TierBadge tier={p.tier} /> : <span className="text-[10px] text-slate-400">—</span>}
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
