import type { Contact, Opportunity, Partner, TimelineEvent, Training } from "@prisma/client";
import { parseIndustries } from "./taxonomy";

export type PartnerWithRelations = Partner & {
  contacts: Contact[];
  opportunities: Opportunity[];
  events: TimelineEvent[];
  trainings: Training[];
};

export type Completeness = {
  score: number; // 0-100
  missing: string[];
};

type Check = { label: string; weight: number; ok: (p: PartnerWithRelations) => boolean };

const CHECKS: Check[] = [
  { label: "City / country", weight: 5, ok: (p) => !!p.city && !!p.country },
  { label: "Company size", weight: 4, ok: (p) => !!p.headcount },
  { label: "Website", weight: 3, ok: (p) => !!p.website },
  { label: "Core business / capability", weight: 6, ok: (p) => !!(p.coreBusiness || p.capability) },
  { label: "Known clients", weight: 6, ok: (p) => !!p.knownClients },
  { label: "当前工具", weight: 5, ok: (p) => !!p.currentTools },
  { label: "Joint value pattern", weight: 5, ok: (p) => !!p.valuePattern },
  { label: "Value proposition (3 lines)", weight: 5, ok: (p) => !!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome) },
  { label: "Partner archetype", weight: 4, ok: (p) => !!p.partnerArchetype && p.partnerArchetype !== "OTHER" },
  { label: "Target industries", weight: 4, ok: (p) => parseIndustries(p).some((c) => c && c !== "OTHER") },
  { label: "Dedicated headcount", weight: 4, ok: (p) => !!p.dedicatedHeadcount },
  { label: "Core playbook", weight: 5, ok: (p) => !!p.playbook },
  { label: "Fit score", weight: 4, ok: (p) => p.fitScore != null },
  { label: "Priority", weight: 3, ok: (p) => !!p.priority },
  { label: "Sales owner", weight: 3, ok: (p) => !!(p.salesUserId || p.ownerId) },
  { label: "Pre-sales owner", weight: 2, ok: (p) => !!p.presalesUserId },
  { label: "At least 1 key contact", weight: 10, ok: (p) => p.contacts.length > 0 },
  { label: "Decision maker identified", weight: 8, ok: (p) => p.contacts.some((c) => c.role === "DECISION_MAKER") },
  { label: "Contact has contact info", weight: 4, ok: (p) => p.contacts.some((c) => !!c.contactInfo) },
  { label: "At least 1 tracked opportunity", weight: 10, ok: (p) => p.opportunities.length > 0 },
  { label: "Activity in last 30 days", weight: 8, ok: (p) => p.events.some((e) => Date.now() - new Date(e.createdAt).getTime() < 30 * 24 * 3600 * 1000) },
  { label: "Training / certification plan", weight: 4, ok: (p) => p.trainings.length > 0 },
];

export function computeCompleteness(p: PartnerWithRelations): Completeness {
  const total = CHECKS.reduce((s, c) => s + c.weight, 0);
  let got = 0;
  const missing: string[] = [];
  for (const c of CHECKS) {
    if (c.ok(p)) got += c.weight;
    else missing.push(c.label);
  }
  return { score: Math.round((got / total) * 100), missing };
}

export function staleDays(p: { events: TimelineEvent[]; updatedAt: Date }): number {
  const last = p.events.length
    ? Math.max(...p.events.map((e) => new Date(e.createdAt).getTime()))
    : new Date(p.updatedAt).getTime();
  return Math.floor((Date.now() - last) / (24 * 3600 * 1000));
}
