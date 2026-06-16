import type { Contact, Opportunity, Partner, TimelineEvent, Training } from "@prisma/client";

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
  { label: "城市/国家", weight: 5, ok: (p) => !!p.city && !!p.country },
  { label: "公司规模", weight: 4, ok: (p) => !!p.headcount },
  { label: "官网", weight: 3, ok: (p) => !!p.website },
  { label: "核心业务/能力", weight: 6, ok: (p) => !!(p.coreBusiness || p.capability) },
  { label: "已知客户", weight: 6, ok: (p) => !!p.knownClients },
  { label: "现有BI工具", weight: 5, ok: (p) => !!p.currentTools },
  { label: "认证级别", weight: 4, ok: (p) => !!p.certLevel },
  { label: "关键差异化", weight: 5, ok: (p) => !!p.keyDifferentiator },
  { label: "联合价值模式", weight: 5, ok: (p) => !!p.valuePattern },
  { label: "价值三行", weight: 5, ok: (p) => !!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome) },
  { label: "伙伴类型", weight: 4, ok: (p) => !!p.partnerArchetype && p.partnerArchetype !== "OTHER" },
  { label: "主攻行业", weight: 4, ok: (p) => !!p.industry && p.industry !== "OTHER" },
  { label: "专职人数", weight: 4, ok: (p) => !!p.dedicatedHeadcount },
  { label: "核心打法/playbook", weight: 5, ok: (p) => !!p.playbook },
  { label: "契合度评分", weight: 4, ok: (p) => p.fitScore != null },
  { label: "优先级", weight: 3, ok: (p) => !!p.priority },
  { label: "负责BD", weight: 5, ok: (p) => !!p.ownerId },
  { label: "至少1位关键联系人", weight: 10, ok: (p) => p.contacts.length > 0 },
  { label: "明确最终决策者", weight: 8, ok: (p) => p.contacts.some((c) => c.role === "DECISION_MAKER") },
  { label: "联系人有联系方式", weight: 4, ok: (p) => p.contacts.some((c) => !!c.contactInfo) },
  { label: "至少1个跟踪商机", weight: 10, ok: (p) => p.opportunities.length > 0 },
  { label: "近30天有动态", weight: 8, ok: (p) => p.events.some((e) => Date.now() - new Date(e.createdAt).getTime() < 30 * 24 * 3600 * 1000) },
  { label: "培训认证计划", weight: 4, ok: (p) => p.trainings.length > 0 },
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
