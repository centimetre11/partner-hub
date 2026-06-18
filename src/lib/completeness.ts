import type { TimelineEvent } from "@prisma/client";
import type { PartnerWithRelations } from "./completeness-types";
import type { LabelsBundle } from "./i18n/labels";
import { labelsEn } from "./i18n/labels";
import { parseIndustries } from "./taxonomy";

export type { PartnerWithRelations } from "./completeness-types";

export type Completeness = {
  score: number;
  missing: string[];
};

type Check = { labelKey: number; weight: number; ok: (p: PartnerWithRelations) => boolean };

const CHECKS: Check[] = [
  { labelKey: 0, weight: 5, ok: (p) => !!p.city && !!p.country },
  { labelKey: 1, weight: 4, ok: (p) => !!p.headcount },
  { labelKey: 2, weight: 3, ok: (p) => !!p.website },
  { labelKey: 3, weight: 6, ok: (p) => !!(p.coreBusiness || p.capability) },
  { labelKey: 4, weight: 6, ok: (p) => !!p.knownClients },
  { labelKey: 5, weight: 5, ok: (p) => !!p.currentTools },
  { labelKey: 6, weight: 5, ok: (p) => !!p.valuePattern },
  { labelKey: 7, weight: 5, ok: (p) => !!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome) },
  { labelKey: 8, weight: 4, ok: (p) => !!p.partnerArchetype && p.partnerArchetype !== "OTHER" },
  { labelKey: 9, weight: 4, ok: (p) => parseIndustries(p).some((c) => c && c !== "OTHER") },
  { labelKey: 10, weight: 4, ok: (p) => !!p.dedicatedHeadcount },
  { labelKey: 11, weight: 5, ok: (p) => !!p.playbook },
  { labelKey: 12, weight: 4, ok: (p) => p.fitScore != null },
  { labelKey: 13, weight: 3, ok: (p) => !!p.priority },
  { labelKey: 14, weight: 3, ok: (p) => !!(p.salesUserId || p.ownerId) },
  { labelKey: 15, weight: 2, ok: (p) => !!p.presalesUserId },
  { labelKey: 16, weight: 10, ok: (p) => p.contacts.length > 0 },
  { labelKey: 17, weight: 8, ok: (p) => p.contacts.some((c) => c.role === "DECISION_MAKER") },
  { labelKey: 18, weight: 4, ok: (p) => p.contacts.some((c) => !!c.contactInfo) },
  { labelKey: 19, weight: 10, ok: (p) => p.opportunities.length > 0 },
  { labelKey: 20, weight: 8, ok: (p) => p.events.some((e) => Date.now() - new Date(e.createdAt).getTime() < 30 * 24 * 3600 * 1000) },
  { labelKey: 21, weight: 4, ok: (p) => p.trainings.length > 0 },
];

export function computeCompleteness(p: PartnerWithRelations, ui: LabelsBundle = { ...labelsEn, locale: "en" }): Completeness {
  const total = CHECKS.reduce((s, c) => s + c.weight, 0);
  let got = 0;
  const missing: string[] = [];
  for (const c of CHECKS) {
    if (c.ok(p)) got += c.weight;
    else missing.push(ui.completenessLabels[c.labelKey] ?? "");
  }
  return { score: Math.round((got / total) * 100), missing };
}

export function staleDays(p: { events: TimelineEvent[]; updatedAt: Date }): number {
  const last = p.events.length
    ? Math.max(...p.events.map((e) => new Date(e.createdAt).getTime()))
    : new Date(p.updatedAt).getTime();
  return Math.floor((Date.now() - last) / (24 * 3600 * 1000));
}
