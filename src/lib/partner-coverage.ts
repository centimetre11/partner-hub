import {
  FOCUS_COUNTRY_CODES,
  UNKNOWN_COUNTRY_CODE,
  countryLabel,
  normalizeCountryKey,
} from "./country";
import { parseCapabilities, parseIndustries } from "./taxonomy";
import { normalizePartnerTier, type PartnerTier } from "./tier";

export const NONE_AXIS_CODE = "_NONE_";

export type CoverageAxisPair = "region-industry" | "region-capability" | "industry-capability";
export type PipelineStage = 1 | 2 | 3;

export type CoveragePartnerInput = {
  id: string;
  name: string;
  tier?: string | null;
  pipelineStage?: number | null;
  country?: string | null;
  city?: string | null;
  industries?: string | null;
  capabilities?: string | null;
};

export type CoveragePartnerRef = {
  id: string;
  name: string;
  tier: PartnerTier | null;
  pipelineStage: PipelineStage;
};

export type CoverageCell = {
  rowKey: string;
  colKey: string;
  partners: CoveragePartnerRef[];
  count: number;
  /** Deepest pipeline stage in cell; null if empty */
  bestStage: PipelineStage | null;
  /** true when count === 0 */
  isGap: boolean;
  /** covered but deepest stage is only 1 */
  isShallow: boolean;
};

export type CoverageGapItem = {
  kind: "region" | "industry" | "capability" | "cell";
  key: string;
  label: string;
  colKey?: string;
  colLabel?: string;
};

export type CoverageMatrix = {
  pair: CoverageAxisPair;
  rowKeys: string[];
  colKeys: string[];
  rowLabels: Record<string, string>;
  colLabels: Record<string, string>;
  cells: CoverageCell[];
  cellMap: Map<string, CoverageCell>;
  gaps: CoverageGapItem[];
  /** Covered but deepest stage === 1 */
  shallow: CoverageGapItem[];
};

function cellKey(row: string, col: string) {
  return `${row}||${col}`;
}

export function normalizePipelineStage(raw: number | null | undefined): PipelineStage {
  if (raw === 2) return 2;
  if (raw === 3) return 3;
  return 1;
}

function bestStageOf(partners: CoveragePartnerRef[]): PipelineStage | null {
  if (!partners.length) return null;
  let best: PipelineStage = 1;
  for (const p of partners) {
    if (p.pipelineStage > best) best = p.pipelineStage;
  }
  return best;
}

/** CSS classes for heat cells by deepest pipeline stage. */
export function coverageCellTone(cell: Pick<CoverageCell, "isGap" | "bestStage">): string {
  if (cell.isGap) return "bg-slate-50 border-dashed border-slate-200 text-slate-400";
  if (cell.bestStage === 3) return "bg-emerald-600 text-white border-emerald-700";
  if (cell.bestStage === 2) return "bg-sky-500 text-white border-sky-600";
  return "bg-amber-100 text-amber-900 border-amber-300";
}

export function buildCoverageMatrix(
  partners: CoveragePartnerInput[],
  pair: CoverageAxisPair,
  opts: {
    locale: "zh" | "en";
    industryLabels: Record<string, string>;
    capabilityLabels: Record<string, string>;
    industryOrder?: string[];
    capabilityOrder?: string[];
    noneIndustryLabel: string;
    noneCapabilityLabel: string;
    /** When set, only include partners in this pipeline stage */
    stageFilter?: PipelineStage | null;
  },
): CoverageMatrix {
  const industryOrder = opts.industryOrder ?? Object.keys(opts.industryLabels);
  const capabilityOrder = opts.capabilityOrder ?? Object.keys(opts.capabilityLabels);
  const stageFilter = opts.stageFilter ?? null;

  const filtered = stageFilter
    ? partners.filter((p) => normalizePipelineStage(p.pipelineStage) === stageFilter)
    : partners;

  const regionKeys = [...FOCUS_COUNTRY_CODES, UNKNOWN_COUNTRY_CODE];
  const regionLabels: Record<string, string> = Object.fromEntries(
    regionKeys.map((c) => [c, countryLabel(c, opts.locale)]),
  );

  const industryKeys = [...industryOrder, NONE_AXIS_CODE];
  const industryLabels: Record<string, string> = {
    ...opts.industryLabels,
    [NONE_AXIS_CODE]: opts.noneIndustryLabel,
  };

  const capabilityKeys = [...capabilityOrder, NONE_AXIS_CODE];
  const capabilityLabels: Record<string, string> = {
    ...opts.capabilityLabels,
    [NONE_AXIS_CODE]: opts.noneCapabilityLabel,
  };

  let rowKeys: string[];
  let colKeys: string[];
  let rowLabels: Record<string, string>;
  let colLabels: Record<string, string>;

  if (pair === "region-industry") {
    rowKeys = regionKeys;
    colKeys = industryKeys;
    rowLabels = regionLabels;
    colLabels = industryLabels;
  } else if (pair === "region-capability") {
    rowKeys = regionKeys;
    colKeys = capabilityKeys;
    rowLabels = regionLabels;
    colLabels = capabilityLabels;
  } else {
    rowKeys = industryKeys;
    colKeys = capabilityKeys;
    rowLabels = industryLabels;
    colLabels = capabilityLabels;
  }

  const buckets = new Map<string, CoveragePartnerRef[]>();
  for (const rk of rowKeys) {
    for (const ck of colKeys) {
      buckets.set(cellKey(rk, ck), []);
    }
  }

  const regionCounts = new Map<string, CoveragePartnerRef[]>();
  const industryCounts = new Map<string, CoveragePartnerRef[]>();
  const capabilityCounts = new Map<string, CoveragePartnerRef[]>();
  for (const rk of regionKeys) regionCounts.set(rk, []);
  for (const ik of industryKeys) industryCounts.set(ik, []);
  for (const ck of capabilityKeys) capabilityCounts.set(ck, []);

  for (const p of filtered) {
    const ref: CoveragePartnerRef = {
      id: p.id,
      name: p.name,
      tier: normalizePartnerTier(p.tier),
      pipelineStage: normalizePipelineStage(p.pipelineStage),
    };
    const region = normalizeCountryKey(p.country, p.city);
    const industries = parseIndustries(p);
    const capabilities = parseCapabilities(p);
    const indKeys = industries.length ? industries : [NONE_AXIS_CODE];
    const capKeys = capabilities.length ? capabilities : [NONE_AXIS_CODE];

    if (!regionCounts.has(region)) regionCounts.set(region, []);
    pushUnique(regionCounts.get(region)!, ref);

    for (const ik of indKeys) {
      if (!industryCounts.has(ik)) industryCounts.set(ik, []);
      pushUnique(industryCounts.get(ik)!, ref);
    }
    for (const ck of capKeys) {
      if (!capabilityCounts.has(ck)) capabilityCounts.set(ck, []);
      pushUnique(capabilityCounts.get(ck)!, ref);
    }

    if (pair === "region-industry") {
      for (const ik of indKeys) {
        const list = buckets.get(cellKey(region, ik));
        if (list) pushUnique(list, ref);
      }
    } else if (pair === "region-capability") {
      for (const ck of capKeys) {
        const list = buckets.get(cellKey(region, ck));
        if (list) pushUnique(list, ref);
      }
    } else {
      for (const ik of indKeys) {
        for (const ck of capKeys) {
          const list = buckets.get(cellKey(ik, ck));
          if (list) pushUnique(list, ref);
        }
      }
    }
  }

  const cells: CoverageCell[] = [];
  const cellMap = new Map<string, CoverageCell>();
  for (const rk of rowKeys) {
    for (const ck of colKeys) {
      const list = buckets.get(cellKey(rk, ck)) ?? [];
      const best = bestStageOf(list);
      const cell: CoverageCell = {
        rowKey: rk,
        colKey: ck,
        partners: list,
        count: list.length,
        bestStage: best,
        isGap: list.length === 0,
        isShallow: list.length > 0 && best === 1,
      };
      cells.push(cell);
      cellMap.set(cellKey(rk, ck), cell);
    }
  }

  const gaps: CoverageGapItem[] = [];
  const shallow: CoverageGapItem[] = [];

  // Dimension-level empty gaps (unfiltered intent: use all partners for true "no partner" gaps
  // when stage filter is on, gaps reflect filtered set — OK for "where are stage-3 partners")
  for (const code of FOCUS_COUNTRY_CODES) {
    const list = regionCounts.get(code) ?? [];
    if (list.length === 0) {
      gaps.push({ kind: "region", key: code, label: regionLabels[code] ?? code });
    } else if (bestStageOf(list) === 1) {
      shallow.push({ kind: "region", key: code, label: regionLabels[code] ?? code });
    }
  }

  for (const code of capabilityOrder) {
    const list = capabilityCounts.get(code) ?? [];
    if (list.length === 0) {
      gaps.push({ kind: "capability", key: code, label: capabilityLabels[code] ?? code });
    } else if (bestStageOf(list) === 1) {
      shallow.push({ kind: "capability", key: code, label: capabilityLabels[code] ?? code });
    }
  }

  for (const code of industryOrder) {
    const list = industryCounts.get(code) ?? [];
    if (list.length === 0) {
      gaps.push({ kind: "industry", key: code, label: industryLabels[code] ?? code });
    } else if (bestStageOf(list) === 1) {
      shallow.push({ kind: "industry", key: code, label: industryLabels[code] ?? code });
    }
  }

  // Cell-level shallow for current matrix (e.g. Saudi × Manufacturing)
  for (const cell of cells) {
    if (!cell.isShallow) continue;
    if (cell.rowKey === NONE_AXIS_CODE || cell.colKey === NONE_AXIS_CODE) continue;
    if (cell.rowKey === UNKNOWN_COUNTRY_CODE) continue;
    shallow.push({
      kind: "cell",
      key: cell.rowKey,
      label: rowLabels[cell.rowKey] ?? cell.rowKey,
      colKey: cell.colKey,
      colLabel: colLabels[cell.colKey] ?? cell.colKey,
    });
  }

  return {
    pair,
    rowKeys,
    colKeys,
    rowLabels,
    colLabels,
    cells,
    cellMap,
    gaps,
    shallow,
  };
}

function pushUnique(list: CoveragePartnerRef[], ref: CoveragePartnerRef) {
  if (!list.some((x) => x.id === ref.id)) list.push(ref);
}

export function getCoverageCell(
  matrix: CoverageMatrix,
  rowKey: string,
  colKey: string,
): CoverageCell | undefined {
  return matrix.cellMap.get(cellKey(rowKey, colKey));
}

export function countPartnersByStage(partners: CoveragePartnerInput[]): Record<PipelineStage, number> {
  const counts: Record<PipelineStage, number> = { 1: 0, 2: 0, 3: 0 };
  for (const p of partners) {
    counts[normalizePipelineStage(p.pipelineStage)] += 1;
  }
  return counts;
}
