import "server-only";

import { db } from "./db";
import { END_CUSTOMER_WHERE } from "./customer-filters";
import { OPEN_OPPORTUNITY_STATUSES } from "./opportunity-status";
import type { TaxonomyDimension } from "./taxonomy";
import { labelsEn } from "./i18n/labels";

export const CUSTOMER_SEGMENT_DIMS = [
  "CUSTOMER_SEGMENT",
  "BUYING_TRIGGER",
  "ENTRY_PATH",
  "ICP_TIER",
] as const satisfies readonly TaxonomyDimension[];

/** Map partner category → default customer entry path */
export function entryPathFromPartnerCategory(category: string | null | undefined): string | null {
  switch (category) {
    case "PURE_DATA":
      return "PARTNER_PURE_DATA";
    case "POWER_BI":
      return "PARTNER_POWER_BI";
    case "TABLEAU":
      return "PARTNER_TABLEAU";
    case "IT_INTEGRATOR":
      return "PARTNER_IT_INTEGRATOR";
    case "QLIK":
    case "OTHER":
      return "PARTNER_OTHER";
    default:
      return null;
  }
}

/** Parse partner knownClients free text into candidate company names */
export function parseKnownClientNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[,，;；\n、|/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const cleaned = p
      .replace(/^\d+\.\s*/, "")
      .replace(/^[\-*•]+\s*/, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .trim();
    if (cleaned.length < 2) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export type SegmentInsightRow = {
  code: string;
  label: string;
  prospects: number;
  active: number;
  openOpps: number;
  won: number;
  lost: number;
  partnerCoverage: number;
};

export type SegmentInsightSummary = {
  totalEndCustomers: number;
  taggedCustomers: number;
  taggedRate: number;
  primaryIcpCount: number;
  segments: SegmentInsightRow[];
  icpTiers: { code: string; label: string; count: number }[];
  winFactors: { code: string; label: string; count: number }[];
  lossReasons: { code: string; label: string; count: number }[];
};

function segmentLabel(code: string): string {
  return labelsEn.customerSegmentLabels[code] ?? code;
}

function icpLabel(code: string): string {
  return labelsEn.icpTierLabels[code] ?? code;
}

function winLabel(code: string): string {
  return labelsEn.winFactorLabels[code] ?? code;
}

function lossLabel(code: string): string {
  return labelsEn.lossReasonLabels[code] ?? code;
}

export async function loadSegmentInsightSummary(): Promise<SegmentInsightSummary> {
  const [customers, opportunities, partnerLinks] = await Promise.all([
    db.customer.findMany({
      where: END_CUSTOMER_WHERE,
      select: {
        id: true,
        status: true,
        customerSegment: true,
        icpTier: true,
        buyingTrigger: true,
        entryPath: true,
      },
    }),
    db.opportunity.findMany({
      where: { customer: END_CUSTOMER_WHERE },
      select: {
        status: true,
        customerSegment: true,
        winFactor: true,
        lossReason: true,
        customer: { select: { customerSegment: true } },
      },
    }),
    db.customerPartner.findMany({
      where: { relation: "SERVED_BY", customer: END_CUSTOMER_WHERE },
      select: {
        partnerId: true,
        customer: { select: { customerSegment: true } },
      },
    }),
  ]);

  const totalEndCustomers = customers.length;
  const taggedCount = customers.filter(
    (c) => !!c.customerSegment || !!c.icpTier || !!c.buyingTrigger || !!c.entryPath,
  ).length;
  const primaryIcpCount = customers.filter((c) => c.icpTier === "PRIMARY").length;

  const segmentCodes = Object.keys(labelsEn.customerSegmentLabels);
  const partnerCoverageBySegment = new Map<string, Set<string>>();
  for (const link of partnerLinks) {
    const seg = link.customer.customerSegment;
    if (!seg) continue;
    if (!partnerCoverageBySegment.has(seg)) partnerCoverageBySegment.set(seg, new Set());
    partnerCoverageBySegment.get(seg)!.add(link.partnerId);
  }

  const segments: SegmentInsightRow[] = segmentCodes.map((code) => {
    const segCustomers = customers.filter((c) => c.customerSegment === code);
    const segOpps = opportunities.filter(
      (o) => (o.customerSegment ?? o.customer?.customerSegment) === code,
    );
    return {
      code,
      label: segmentLabel(code),
      prospects: segCustomers.filter((c) => c.status === "PROSPECT").length,
      active: segCustomers.filter((c) => c.status === "ACTIVE").length,
      openOpps: segOpps.filter((o) => (OPEN_OPPORTUNITY_STATUSES as readonly string[]).includes(o.status)).length,
      won: segOpps.filter((o) => o.status === "WON").length,
      lost: segOpps.filter((o) => o.status === "LOST").length,
      partnerCoverage: partnerCoverageBySegment.get(code)?.size ?? 0,
    };
  });

  const untagged = customers.filter((c) => !c.customerSegment);
  if (untagged.length > 0) {
    segments.push({
      code: "_UNTAGGED",
      label: "Untagged",
      prospects: untagged.filter((c) => c.status === "PROSPECT").length,
      active: untagged.filter((c) => c.status === "ACTIVE").length,
      openOpps: opportunities.filter(
        (o) => !o.customerSegment && !o.customer?.customerSegment && (OPEN_OPPORTUNITY_STATUSES as readonly string[]).includes(o.status),
      ).length,
      won: opportunities.filter((o) => !o.customerSegment && !o.customer?.customerSegment && o.status === "WON").length,
      lost: opportunities.filter((o) => !o.customerSegment && !o.customer?.customerSegment && o.status === "LOST").length,
      partnerCoverage: 0,
    });
  }

  segments.sort(
    (a, b) =>
      b.openOpps + b.won + b.active + b.prospects - (a.openOpps + a.won + a.active + a.prospects),
  );

  const icpTiers = Object.keys(labelsEn.icpTierLabels).map((code) => ({
    code,
    label: icpLabel(code),
    count: customers.filter((c) => c.icpTier === code).length,
  }));

  const winFactors = Object.keys(labelsEn.winFactorLabels)
    .map((code) => ({
      code,
      label: winLabel(code),
      count: opportunities.filter((o) => o.status === "WON" && o.winFactor === code).length,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const lossReasons = Object.keys(labelsEn.lossReasonLabels)
    .map((code) => ({
      code,
      label: lossLabel(code),
      count: opportunities.filter((o) => o.status === "LOST" && o.lossReason === code).length,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    totalEndCustomers,
    taggedCustomers: taggedCount,
    taggedRate: totalEndCustomers ? Math.round((taggedCount / totalEndCustomers) * 100) : 0,
    primaryIcpCount,
    segments,
    icpTiers,
    winFactors,
    lossReasons,
  };
}

export type ImportKnownClientsResult = {
  created: number;
  skipped: number;
  linked: number;
  names: string[];
};

export async function importKnownClientsForPartner(partnerId: string): Promise<ImportKnownClientsResult> {
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, knownClients: true, category: true, country: true },
  });
  if (!partner) throw new Error("PARTNER_NOT_FOUND");

  const names = parseKnownClientNames(partner.knownClients);
  const entryPath = entryPathFromPartnerCategory(partner.category);
  let created = 0;
  let skipped = 0;
  let linked = 0;
  const createdNames: string[] = [];

  const existing = await db.customer.findMany({
    where: END_CUSTOMER_WHERE,
    select: { id: true, name: true, partnerLinks: { select: { partnerId: true } } },
  });
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  for (const name of names) {
    const hit = byName.get(name.toLowerCase());
    if (hit) {
      const alreadyLinked = hit.partnerLinks.some((l) => l.partnerId === partnerId);
      if (!alreadyLinked) {
        await db.customerPartner.create({
          data: { customerId: hit.id, partnerId, relation: "SERVED_BY" },
        });
        linked += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const customer = await db.customer.create({
      data: {
        name,
        status: "PROSPECT",
        country: partner.country,
        entryPath,
        partnerRelation: "SERVED_BY",
        partnerLinks: { create: { partnerId, relation: "SERVED_BY" } },
        notes: `Imported from partner known clients: ${partner.name}`,
      },
    });
    byName.set(name.toLowerCase(), { id: customer.id, name: customer.name, partnerLinks: [{ partnerId }] });
    created += 1;
    createdNames.push(name);
  }

  return { created, skipped, linked, names: createdNames };
}
