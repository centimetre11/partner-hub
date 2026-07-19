import { db } from "./db";
import { labelsEn } from "./i18n/labels";
import { getLabels, type LabelsBundle } from "./i18n/labels";
import { getLocale } from "./i18n/locale-server";
import { type Locale } from "./i18n/locale";

export type TaxonomyDimension =
  | "ARCHETYPE"
  | "INDUSTRY"
  | "VALUE_PATTERN"
  | "CATEGORY"
  | "CAPABILITY"
  | "CUSTOMER_SEGMENT"
  | "BUYING_TRIGGER"
  | "ENTRY_PATH"
  | "ICP_TIER"
  | "WIN_FACTOR"
  | "LOSS_REASON";

export type TaxonomyOptionRow = {
  code: string;
  label: string;
  description?: string | null;
  isBuiltin: boolean;
};

/** English builtin maps — used for DB seed/sync only */
const BUILTIN_EN: Record<TaxonomyDimension, Record<string, string>> = {
  ARCHETYPE: labelsEn.partnerArchetypeLabels,
  INDUSTRY: labelsEn.industryLabels,
  VALUE_PATTERN: labelsEn.valuePatternLabels,
  CATEGORY: labelsEn.categoryLabels,
  CAPABILITY: labelsEn.capabilityLabels,
  CUSTOMER_SEGMENT: labelsEn.customerSegmentLabels,
  BUYING_TRIGGER: labelsEn.buyingTriggerLabels,
  ENTRY_PATH: labelsEn.entryPathLabels,
  ICP_TIER: labelsEn.icpTierLabels,
  WIN_FACTOR: labelsEn.winFactorLabels,
  LOSS_REASON: labelsEn.lossReasonLabels,
};

function builtinMapForLocale(ui: LabelsBundle): Record<TaxonomyDimension, Record<string, string>> {
  return {
    ARCHETYPE: ui.partnerArchetypeLabels,
    INDUSTRY: ui.industryLabels,
    VALUE_PATTERN: ui.valuePatternLabels,
    CATEGORY: ui.categoryLabels,
    CAPABILITY: ui.capabilityLabels,
    CUSTOMER_SEGMENT: ui.customerSegmentLabels,
    BUYING_TRIGGER: ui.buyingTriggerLabels,
    ENTRY_PATH: ui.entryPathLabels,
    ICP_TIER: ui.icpTierLabels,
    WIN_FACTOR: ui.winFactorLabels,
    LOSS_REASON: ui.lossReasonLabels,
  };
}

export function getTaxonomyDimensionMeta(locale: Locale) {
  const ui = getLabels(locale);
  return Object.fromEntries(
    (Object.keys(ui.taxonomyMeta) as TaxonomyDimension[]).map((dim) => [
      dim,
      { ...ui.taxonomyMeta[dim], libraryPath: `/taxonomy?dim=${dim}` },
    ]),
  ) as Record<TaxonomyDimension, { label: string; libraryPath: string; hint: string }>;
}

/** @deprecated Use getTaxonomyDimensionMeta(locale) */
export const TAXONOMY_DIMENSION_META = getTaxonomyDimensionMeta("en");

export function slugTaxonomyCode(label: string) {
  const s = label
    .trim()
    .toUpperCase()
    .replace(/[\s\-/]+/g, "_")
    .replace(/[^\w\u4e00-\u9fff]/g, "")
    .slice(0, 48);
  return s || `CUSTOM_${Date.now()}`;
}

function parseJsonCodeArray(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* invalid JSON */
  }
  return [];
}

function stringifyCodeArray(codes: string[]) {
  const uniq = [...new Set(codes.filter(Boolean))];
  return uniq.length ? JSON.stringify(uniq) : null;
}

function normalizeCodeArrayInput(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    const codes = raw.map(String).map((s) => s.trim()).filter(Boolean);
    return stringifyCodeArray(codes);
  }
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const codes = parsed.map(String).filter(Boolean);
        return stringifyCodeArray(codes);
      }
    } catch {
      /* fall through */
    }
  }
  const codes = trimmed.includes(",") ? trimmed.split(",").map((s) => s.trim()).filter(Boolean) : [trimmed];
  return stringifyCodeArray(codes);
}

export function parseIndustries(p: { industries?: string | null }): string[] {
  return parseJsonCodeArray(p.industries);
}

export function stringifyIndustries(codes: string[]) {
  return stringifyCodeArray(codes);
}

export function normalizeIndustriesInput(raw: unknown): { industries: string | null } {
  return { industries: normalizeCodeArrayInput(raw) };
}

export function parseCapabilities(p: { capabilities?: string | null }): string[] {
  return parseJsonCodeArray(p.capabilities);
}

export function stringifyCapabilities(codes: string[]) {
  return stringifyCodeArray(codes);
}

export function normalizeCapabilitiesInput(raw: unknown): { capabilities: string | null } {
  return { capabilities: normalizeCodeArrayInput(raw) };
}

let builtinLabelsSynced = false;

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

  for (const [dimension, map] of Object.entries(BUILTIN_EN) as [TaxonomyDimension, Record<string, string>][]) {
    Object.entries(map).forEach(([code, label], i) => {
      rows.push({ dimension, code, label, sortOrder: i, isBuiltin: true });
    });
  }

  await db.taxonomyOption.createMany({ data: rows });
}

async function syncBuiltinTaxonomyLabels() {
  if (builtinLabelsSynced) return;
  await ensureTaxonomySeed();
  for (const [dimension, map] of Object.entries(BUILTIN_EN) as [TaxonomyDimension, Record<string, string>][]) {
    let sortOrder = 0;
    for (const [code, label] of Object.entries(map)) {
      const existing = await db.taxonomyOption.findUnique({
        where: { dimension_code: { dimension, code } },
      });
      if (!existing) {
        await db.taxonomyOption.create({
          data: { dimension, code, label, sortOrder, isBuiltin: true },
        });
      } else if (existing.isBuiltin) {
        await db.taxonomyOption.update({
          where: { id: existing.id },
          data: { label },
        });
      }
      sortOrder += 1;
    }
  }
  builtinLabelsSynced = true;
}

function displayLabel(
  ui: LabelsBundle,
  dimension: TaxonomyDimension,
  row: { code: string; label: string; isBuiltin: boolean },
): string {
  if (row.isBuiltin) {
    return builtinMapForLocale(ui)[dimension][row.code] ?? row.code;
  }
  return row.label;
}

export async function getTaxonomyOptions(dimension: TaxonomyDimension, locale?: Locale): Promise<TaxonomyOptionRow[]> {
  await syncBuiltinTaxonomyLabels();
  const loc = locale ?? (await getLocale());
  const ui = getLabels(loc);
  const rows = await db.taxonomyOption.findMany({
    where: { dimension },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  if (rows.length === 0) {
    return Object.entries(builtinMapForLocale(ui)[dimension]).map(([code, label]) => ({
      code,
      label,
      isBuiltin: true,
    }));
  }
  return rows.map((r) => ({
    code: r.code,
    label: displayLabel(ui, dimension, r),
    description: r.description,
    isBuiltin: r.isBuiltin,
  }));
}

export async function loadTaxonomyLabelMaps(locale?: Locale): Promise<Record<TaxonomyDimension, Record<string, string>>> {
  await syncBuiltinTaxonomyLabels();
  const loc = locale ?? (await getLocale());
  const ui = getLabels(loc);
  const maps = {} as Record<TaxonomyDimension, Record<string, string>>;
  for (const dim of Object.keys(BUILTIN_EN) as TaxonomyDimension[]) {
    maps[dim] = { ...builtinMapForLocale(ui)[dim] };
  }
  const rows = await db.taxonomyOption.findMany();
  for (const r of rows) {
    const dim = r.dimension as TaxonomyDimension;
    if (!maps[dim]) continue;
    if (!r.isBuiltin) maps[dim][r.code] = r.label;
  }
  return maps;
}

export function labelFromMap(map: Record<string, string>, code: string | null | undefined, fallback = "—") {
  if (!code) return fallback;
  return map[code] ?? code;
}

export function labelsFromMap(map: Record<string, string>, codes: string[], fallback?: string, ui?: LabelsBundle) {
  const fb = fallback ?? (ui ? (ui.locale === "zh" ? "待判定" : "TBD") : "TBD");
  if (codes.length === 0) return fb;
  return codes.map((c) => map[c] ?? c).join(" · ");
}

export async function taxonomyListForAi(dimension: TaxonomyDimension) {
  const opts = await db.taxonomyOption.findMany({ where: { dimension } });
  if (opts.length === 0) {
    return Object.entries(BUILTIN_EN[dimension])
      .map(([code, label]) => `${code}=${label}`)
      .join(", ");
  }
  return opts.map((o) => `${o.code}=${o.label}`).join(", ");
}
