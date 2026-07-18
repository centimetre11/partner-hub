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

export type CoveragePartnerInput = {
  id: string;
  name: string;
  tier?: string | null;
  country?: string | null;
  city?: string | null;
  industries?: string | null;
  capabilities?: string | null;
};

export type CoveragePartnerRef = {
  id: string;
  name: string;
  tier: PartnerTier | null;
};

export type CoverageCell = {
  rowKey: string;
  colKey: string;
  partners: CoveragePartnerRef[];
  count: number;
  /** Strongest tier in cell; null if empty or all untiered */
  bestTier: PartnerTier | null;
  /** true when count === 0 */
  isGap: boolean;
  /** covered but only C or untiered */
  isWeak: boolean;
};

export type CoverageGapItem = {
  kind: "region" | "industry" | "capability" | "cell";
  key: string;
  label: string;
  /** optional second axis for cell gaps */
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
  weak: CoverageGapItem[];
};

function cellKey(row: string, col: string) {
  return `${row}||${col}`;
}

function tierRank(tier: PartnerTier | null): number {
  if (tier === "A") return 3;
  if (tier === "B") return 2;
  if (tier === "C") return 1;
  return 0;
}

function bestTierOf(partners: CoveragePartnerRef[]): PartnerTier | null {
  let best: PartnerTier | null = null;
  let rank = -1;
  for (const p of partners) {
    const r = tierRank(p.tier);
    if (r > rank) {
      rank = r;
      best = p.tier;
    }
  }
  return best;
}

/** CSS background classes for heat cells (A darkest). */
export function coverageCellTone(cell: CoverageCell): string {
  if (cell.isGap) return "bg-slate-50 border-dashed border-slate-200 text-slate-400";
  if (cell.bestTier === "A") return "bg-sky-700 text-white border-sky-800";
  if (cell.bestTier === "B") return "bg-sky-500 text-white border-sky-600";
  if (cell.bestTier === "C") return "bg-sky-200 text-slate-800 border-sky-300";
  return "bg-sky-100 text-slate-700 border-sky-200";
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
  },
): CoverageMatrix {
  const industryOrder = opts.industryOrder ?? Object.keys(opts.industryLabels);
  const capabilityOrder = opts.capabilityOrder ?? Object.keys(opts.capabilityLabels);

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

  // Single-dimension tallies for gap summary
  const regionCounts = new Map<string, CoveragePartnerRef[]>();
  const industryCounts = new Map<string, CoveragePartnerRef[]>();
  const capabilityCounts = new Map<string, CoveragePartnerRef[]>();
  for (const rk of regionKeys) regionCounts.set(rk, []);
  for (const ik of industryKeys) industryCounts.set(ik, []);
  for (const ck of capabilityKeys) capabilityCounts.set(ck, []);

  for (const p of partners) {
    const ref: CoveragePartnerRef = {
      id: p.id,
      name: p.name,
      tier: normalizePartnerTier(p.tier),
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
      const best = bestTierOf(list);
      const cell: CoverageCell = {
        rowKey: rk,
        colKey: ck,
        partners: list,
        count: list.length,
        bestTier: best,
        isGap: list.length === 0,
        isWeak: list.length > 0 && (best === null || best === "C"),
      };
      cells.push(cell);
      cellMap.set(cellKey(rk, ck), cell);
    }
  }

  const gaps: CoverageGapItem[] = [];
  const weak: CoverageGapItem[] = [];

  for (const code of FOCUS_COUNTRY_CODES) {
    const list = regionCounts.get(code) ?? [];
    if (list.length === 0) {
      gaps.push({ kind: "region", key: code, label: regionLabels[code] ?? code });
    } else if (bestTierOf(list) === null || bestTierOf(list) === "C") {
      weak.push({ kind: "region", key: code, label: regionLabels[code] ?? code });
    }
  }

  for (const code of capabilityOrder) {
    const list = capabilityCounts.get(code) ?? [];
    if (list.length === 0) {
      gaps.push({ kind: "capability", key: code, label: capabilityLabels[code] ?? code });
    } else if (bestTierOf(list) === null || bestTierOf(list) === "C") {
      weak.push({ kind: "capability", key: code, label: capabilityLabels[code] ?? code });
    }
  }

  for (const code of industryOrder) {
    const list = industryCounts.get(code) ?? [];
    if (list.length === 0) {
      gaps.push({ kind: "industry", key: code, label: industryLabels[code] ?? code });
    } else if (bestTierOf(list) === null || bestTierOf(list) === "C") {
      weak.push({ kind: "industry", key: code, label: industryLabels[code] ?? code });
    }
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
    weak,
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
