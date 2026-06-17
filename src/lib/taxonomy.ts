import { db } from "./db";
import { CATEGORY_LABELS, INDUSTRY_LABELS } from "./constants";
import { PARTNER_ARCHETYPE_LABELS, VALUE_PATTERN_LABELS } from "./partner-framework";

export type TaxonomyDimension = "ARCHETYPE" | "INDUSTRY" | "VALUE_PATTERN" | "CATEGORY";

export type TaxonomyOptionRow = {
  code: string;
  label: string;
  description?: string | null;
  isBuiltin: boolean;
};

export const TAXONOMY_DIMENSION_META: Record<
  TaxonomyDimension,
  { label: string; libraryPath: string; hint: string }
> = {
  ARCHETYPE: { label: "伙伴类型", libraryPath: "/taxonomy?dim=ARCHETYPE", hint: "怎么带" },
  INDUSTRY: { label: "主攻行业", libraryPath: "/taxonomy?dim=INDUSTRY", hint: "打哪行（可多选）" },
  VALUE_PATTERN: { label: "联合价值模式", libraryPath: "/taxonomy?dim=VALUE_PATTERN", hint: "一起卖什么" },
  CATEGORY: { label: "竞品基因", libraryPath: "/taxonomy?dim=CATEGORY", hint: "出身" },
};

const BUILTIN: Record<TaxonomyDimension, Record<string, string>> = {
  ARCHETYPE: PARTNER_ARCHETYPE_LABELS,
  INDUSTRY: INDUSTRY_LABELS,
  VALUE_PATTERN: VALUE_PATTERN_LABELS,
  CATEGORY: CATEGORY_LABELS,
};

export function slugTaxonomyCode(label: string) {
  const s = label
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]+/g, "_")
    .replace(/[^\w\u4e00-\u9fff]/g, "")
    .slice(0, 48);
  return s || `CUSTOM_${Date.now()}`;
}

export function parseIndustries(p: { industries?: string | null; industry?: string | null }): string[] {
  if (p.industries) {
    try {
      const parsed = JSON.parse(p.industries);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return p.industry ? [p.industry] : [];
}

export function stringifyIndustries(codes: string[]) {
  const uniq = [...new Set(codes.filter(Boolean))];
  return uniq.length ? JSON.stringify(uniq) : null;
}

/** AI / 导入：industries 字段或单值 industry 归一化 */
export function normalizeIndustriesInput(raw: string): { industries: string | null; industry: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { industries: null, industry: null };
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const codes = parsed.map(String).filter(Boolean);
        return { industries: stringifyIndustries(codes), industry: codes[0] ?? null };
      }
    } catch {
      /* fall through */
    }
  }
  const codes = trimmed.includes(",") ? trimmed.split(",").map((s) => s.trim()).filter(Boolean) : [trimmed];
  return { industries: stringifyIndustries(codes), industry: codes[0] ?? null };
}

/** 首次使用时把内置枚举写入维度库 */
export async function ensureTaxonomySeed() {
  const count = await db.taxonomyOption.count();
  if (count > 0) return;

  const rows: {
    dimension: TaxonomyDimension;
    code: string;
    label: string;
    sortOrder: number;
    isBuiltin: boolean;
  }[] = [];

  for (const [dimension, map] of Object.entries(BUILTIN) as [TaxonomyDimension, Record<string, string>][]) {
    Object.entries(map).forEach(([code, label], i) => {
      rows.push({ dimension, code, label, sortOrder: i, isBuiltin: true });
    });
  }

  await db.taxonomyOption.createMany({ data: rows });
}

export async function getTaxonomyOptions(dimension: TaxonomyDimension): Promise<TaxonomyOptionRow[]> {
  await ensureTaxonomySeed();
  const rows = await db.taxonomyOption.findMany({
    where: { dimension },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  if (rows.length === 0) {
    return Object.entries(BUILTIN[dimension]).map(([code, label]) => ({
      code,
      label,
      isBuiltin: true,
    }));
  }
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    description: r.description,
    isBuiltin: r.isBuiltin,
  }));
}

export async function loadTaxonomyLabelMaps(): Promise<Record<TaxonomyDimension, Record<string, string>>> {
  await ensureTaxonomySeed();
  const rows = await db.taxonomyOption.findMany();
  const maps = {} as Record<TaxonomyDimension, Record<string, string>>;
  for (const dim of Object.keys(BUILTIN) as TaxonomyDimension[]) {
    maps[dim] = { ...BUILTIN[dim] };
  }
  for (const r of rows) {
    const dim = r.dimension as TaxonomyDimension;
    if (maps[dim]) maps[dim][r.code] = r.label;
  }
  return maps;
}

export function labelFromMap(map: Record<string, string>, code: string | null | undefined, fallback = "—") {
  if (!code) return fallback;
  return map[code] ?? code;
}

export function labelsFromMap(map: Record<string, string>, codes: string[], fallback = "待判定") {
  if (codes.length === 0) return fallback;
  return codes.map((c) => map[c] ?? c).join(" · ");
}

export async function taxonomyListForAi(dimension: TaxonomyDimension) {
  const opts = await getTaxonomyOptions(dimension);
  return opts.map((o) => `${o.code}=${o.label}`).join("，");
}
