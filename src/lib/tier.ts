export type PartnerTier = "A" | "B" | "C";

export const PARTNER_TIERS: PartnerTier[] = ["A", "B", "C"];

/** Normalize legacy or free-text tier values to A/B/C. */
export function normalizePartnerTier(raw: string | null | undefined): PartnerTier | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C") return upper;

  const withoutPrefix = upper.replace(/^TIER\s*/i, "").trim();
  if (withoutPrefix === "A" || withoutPrefix === "B" || withoutPrefix === "C") return withoutPrefix;

  const numeric = withoutPrefix.match(/^T?(\d+)$/);
  if (numeric) {
    const n = parseInt(numeric[1], 10);
    if (n === 1) return "A";
    if (n === 2) return "B";
    if (n === 3) return "C";
  }

  return null;
}

export function tierFromLegacyPriority(priority: string | null | undefined): PartnerTier | null {
  const p = priority?.trim().toUpperCase();
  if (p === "P0") return "A";
  if (p === "P1") return "B";
  if (p === "P2" || p === "P3") return "C";
  return null;
}

export function tierFromLegacyFitScore(score: number | null | undefined): PartnerTier | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 8) return "A";
  if (score >= 5) return "B";
  if (score >= 1) return "C";
  return null;
}

/** Resolve tier from current field or deprecated priority/fitScore. */
export function resolvePartnerTier(partner: {
  tier?: string | null;
  priority?: string | null;
  fitScore?: number | null;
}): PartnerTier | null {
  return (
    normalizePartnerTier(partner.tier) ??
    tierFromLegacyPriority(partner.priority) ??
    tierFromLegacyFitScore(partner.fitScore)
  );
}

/** 旧客户 ICP 优先级 → Tier（PRIMARY=重点对待）。 */
export function tierFromLegacyIcp(icpTier: string | null | undefined): PartnerTier | null {
  const u = icpTier?.trim().toUpperCase();
  if (u === "PRIMARY") return "A";
  if (u === "NURTURE") return "B";
  if (u === "WATCH") return "C";
  return null;
}

/** 客户 Tier：优先新字段，回退旧 icpTier。 */
export function resolveCustomerTier(customer: {
  tier?: string | null;
  icpTier?: string | null;
}): PartnerTier | null {
  return normalizePartnerTier(customer.tier) ?? tierFromLegacyIcp(customer.icpTier);
}

export function formatTierLabel(tier: PartnerTier | string): string {
  const normalized = normalizePartnerTier(tier);
  return normalized ? `Tier ${normalized}` : "";
}

export function isDeprecatedPartnerGradingField(field: string): boolean {
  return field === "priority" || field === "fitScore" || field === "industry";
}

/** Map intake/proposal field value to DB value; returns undefined to skip. */
export function partnerFieldValueFromText(field: string, raw: string): unknown | undefined {
  if (isDeprecatedPartnerGradingField(field)) return undefined;
  const value = raw.trim();
  if (!value && field !== "tier") return value;
  if (field === "pipelineStage") {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 1 || n > 3) return undefined;
    return n;
  }
  if (field === "tier") {
    return normalizePartnerTier(value) ?? undefined;
  }
  return value;
}
