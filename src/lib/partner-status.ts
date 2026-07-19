import { staleDays } from "./completeness";
import { parseCapabilities } from "./taxonomy";

export const STATUS_DIMENSION_KEYS = [
  "relationship",
  "solution",
  "investment",
  "capability",
  "cadence",
  "engagement",
  "pipeline",
] as const;

export type StatusDimensionKey = (typeof STATUS_DIMENSION_KEYS)[number];
export type StatusLevel = 0 | 1 | 2 | 3;

export type StatusOverride = {
  level: StatusLevel;
  note?: string;
  updatedAt: string;
  updatedById?: string;
};

export type StatusOverrides = Partial<Record<StatusDimensionKey, StatusOverride>>;

export type PartnerStatusInput = {
  dedicatedHeadcount?: string | null;
  valuePattern?: string | null;
  valuePartnerOffer?: string | null;
  valueFanruanOffer?: string | null;
  valueCustomerOutcome?: string | null;
  playbook?: string | null;
  pitch?: string | null;
  certLevel?: string | null;
  capabilities?: string | null;
  pipelineStage?: number | null;
  updatedAt: Date;
  contacts: { name: string; role: string; attitude: number }[];
  solutions: { name: string; status: string }[];
  trainings: { status: string }[];
  opportunities: { status: string }[];
  businessRecords: { occurredAt: Date }[];
  events: { createdAt: Date }[];
  /** Recent partner-review items (e.g. last 90 days) */
  reviewItems: { discussedAt: Date | null; status: string; updatedAt: Date }[];
};

export type StatusCopy = {
  evidence: {
    noContacts: string;
    contactCount: string; // {n}
    hasDecisionMaker: string; // {name}
    noDecisionMaker: string;
    strongAttitude: string;
    roleCoverage: string; // {n}
    noSolutionSignal: string;
    hasValuePattern: string;
    valueTrioPartial: string;
    valueTrioComplete: string;
    solutionDraft: string; // {n}
    solutionActive: string; // {n}
    hasPlaybook: string;
    hasPitch: string;
    noDedicatedHeadcount: string;
    dedicatedHeadcount: string; // {value}
    dedicatedTeamStrong: string;
    dedicatedVague: string;
    noCapabilitySignal: string;
    hasCapabilityTags: string; // {n}
    hasCertLevel: string; // {value}
    trainingInProgress: string; // {n}
    trainingDone: string; // {n}
    noCadenceSignal: string;
    hasOpportunities: string; // {n}
    recentReview: string; // {n}
    pipelineStage: string; // {stage}
    systemPartnership: string;
    staleDays: string; // {n}
    recentBusinessRecords: string; // {n} {days}
    noOpportunities: string;
    earlyOpportunities: string; // {n}
    midOpportunities: string; // {n}
    wonOpportunities: string; // {n}
    activeOpportunities: string; // {n}
  };
  next: {
    relationshipL0: string;
    relationshipL1: string;
    relationshipL2: string;
    relationshipL3: string;
    solutionL0: string;
    solutionL1: string;
    solutionL2: string;
    solutionL3: string;
    investmentL0: string;
    investmentL1: string;
    investmentL2: string;
    investmentL3: string;
    capabilityL0: string;
    capabilityL1: string;
    capabilityL2: string;
    capabilityL3: string;
    cadenceL0: string;
    cadenceL1: string;
    cadenceL2: string;
    cadenceL3: string;
    engagementL0: string;
    engagementL1: string;
    engagementL2: string;
    engagementL3: string;
    pipelineL0: string;
    pipelineL1: string;
    pipelineL2: string;
    pipelineL3: string;
  };
};

export type DimensionStatus = {
  key: StatusDimensionKey;
  autoLevel: StatusLevel;
  overrideLevel: StatusLevel | null;
  effectiveLevel: StatusLevel;
  evidence: string[];
  suggestedNext: string;
  note: string | null;
  isOverridden: boolean;
};

export type PartnerStatusOverview = {
  dimensions: DimensionStatus[];
  healthScore: number;
  bottlenecks: StatusDimensionKey[];
};

function clampLevel(n: number): StatusLevel {
  if (n <= 0) return 0;
  if (n >= 3) return 3;
  return n as StatusLevel;
}

function isStatusLevel(n: unknown): n is StatusLevel {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

export function isStatusDimensionKey(k: string): k is StatusDimensionKey {
  return (STATUS_DIMENSION_KEYS as readonly string[]).includes(k);
}

export function parseStatusOverrides(raw?: string | null): StatusOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: StatusOverrides = {};
    for (const key of STATUS_DIMENSION_KEYS) {
      const row = parsed[key];
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (!isStatusLevel(r.level)) continue;
      out[key] = {
        level: r.level,
        note: typeof r.note === "string" ? r.note : undefined,
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
        updatedById: typeof r.updatedById === "string" ? r.updatedById : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeStatusOverrides(overrides: StatusOverrides): string | null {
  const cleaned: StatusOverrides = {};
  for (const key of STATUS_DIMENSION_KEYS) {
    const row = overrides[key];
    if (!row || !isStatusLevel(row.level)) continue;
    cleaned[key] = {
      level: row.level,
      note: row.note?.trim() || undefined,
      updatedAt: row.updatedAt || new Date().toISOString(),
      updatedById: row.updatedById,
    };
  }
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
}

function fill(template: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    template,
  );
}

function valueTrioComplete(p: PartnerStatusInput) {
  return !!(p.valuePartnerOffer?.trim() && p.valueFanruanOffer?.trim() && p.valueCustomerOutcome?.trim());
}

function valueTrioPartial(p: PartnerStatusInput) {
  const n = [p.valuePartnerOffer, p.valueFanruanOffer, p.valueCustomerOutcome].filter((x) => x?.trim()).length;
  return n > 0 && n < 3;
}

function parseDedicatedStrength(raw?: string | null): "none" | "vague" | "filled" | "strong" {
  const v = (raw ?? "").trim();
  if (!v) return "none";
  const lower = v.toLowerCase();
  const hasTeamWord = /团队|专职|全职|dedicated|team|full[- ]?time|ft\b/i.test(v);
  const nums = v.match(/\d+/g)?.map(Number) ?? [];
  const maxNum = nums.length ? Math.max(...nums) : null;
  if (maxNum != null && maxNum >= 2) return "strong";
  if (hasTeamWord && (maxNum == null || maxNum >= 1)) return "strong";
  if (maxNum === 1 || /^[1一]$/.test(v) || lower === "1人" || lower === "1 person") return "filled";
  if (maxNum != null || hasTeamWord) return "filled";
  // vague free text without clear number
  if (v.length <= 2 && !/\d/.test(v)) return "vague";
  return "filled";
}

const ACTIVE_OPP = new Set(["P20", "P50", "P80", "ACTIVE"]);
const MID_OPP = new Set(["P50", "P80"]);
const EARLY_OR_PAUSED = new Set(["P20", "ACTIVE", "PAUSED"]);

function daysAgo(d: Date) {
  return (Date.now() - d.getTime()) / (24 * 3600 * 1000);
}

function scoreRelationship(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  const evidence: string[] = [];
  if (p.contacts.length === 0) {
    return { level: 0, evidence: [copy.evidence.noContacts], next: copy.next.relationshipL0 };
  }
  evidence.push(fill(copy.evidence.contactCount, { n: p.contacts.length }));
  const dm = p.contacts.find((c) => c.role === "DECISION_MAKER");
  if (!dm) {
    evidence.push(copy.evidence.noDecisionMaker);
    return { level: 1, evidence, next: copy.next.relationshipL1 };
  }
  evidence.push(fill(copy.evidence.hasDecisionMaker, { name: dm.name }));
  const roles = new Set(p.contacts.map((c) => c.role));
  evidence.push(fill(copy.evidence.roleCoverage, { n: roles.size }));
  const strong = p.contacts.some((c) => c.role === "DECISION_MAKER" && c.attitude >= 2);
  if (strong && roles.size >= 2) {
    evidence.push(copy.evidence.strongAttitude);
    return { level: 3, evidence, next: copy.next.relationshipL3 };
  }
  return { level: 2, evidence, next: copy.next.relationshipL2 };
}

function scoreSolution(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  const evidence: string[] = [];
  const hasPattern = !!p.valuePattern?.trim();
  const trioOk = valueTrioComplete(p);
  const trioPart = valueTrioPartial(p);
  const drafts = p.solutions.filter((s) => s.status === "DRAFT" || !s.status);
  const active = p.solutions.filter((s) => s.status && s.status !== "DRAFT");
  const hasPlaybook = !!p.playbook?.trim();
  const hasPitch = !!p.pitch?.trim();

  if (!hasPattern && !trioPart && !trioOk && p.solutions.length === 0 && !hasPlaybook && !hasPitch) {
    return { level: 0, evidence: [copy.evidence.noSolutionSignal], next: copy.next.solutionL0 };
  }

  if (hasPattern) evidence.push(copy.evidence.hasValuePattern);
  if (trioOk) evidence.push(copy.evidence.valueTrioComplete);
  else if (trioPart) evidence.push(copy.evidence.valueTrioPartial);
  if (drafts.length) evidence.push(fill(copy.evidence.solutionDraft, { n: drafts.length }));
  if (active.length) evidence.push(fill(copy.evidence.solutionActive, { n: active.length }));
  if (hasPlaybook) evidence.push(copy.evidence.hasPlaybook);
  if (hasPitch) evidence.push(copy.evidence.hasPitch);

  const l3 = (hasPlaybook || hasPitch) && p.solutions.length > 0 && (hasPattern || trioOk || active.length > 0);
  if (l3) return { level: 3, evidence, next: copy.next.solutionL3 };

  const l2 = (hasPattern && trioOk) || active.length > 0;
  if (l2) return { level: 2, evidence, next: copy.next.solutionL2 };

  return { level: 1, evidence, next: copy.next.solutionL1 };
}

function scoreInvestment(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  const strength = parseDedicatedStrength(p.dedicatedHeadcount);
  if (strength === "none") {
    return { level: 0, evidence: [copy.evidence.noDedicatedHeadcount], next: copy.next.investmentL0 };
  }
  const value = p.dedicatedHeadcount!.trim();
  if (strength === "vague") {
    return {
      level: 1,
      evidence: [fill(copy.evidence.dedicatedHeadcount, { value }), copy.evidence.dedicatedVague],
      next: copy.next.investmentL1,
    };
  }
  if (strength === "strong") {
    return {
      level: 3,
      evidence: [fill(copy.evidence.dedicatedHeadcount, { value }), copy.evidence.dedicatedTeamStrong],
      next: copy.next.investmentL3,
    };
  }
  return {
    level: 2,
    evidence: [fill(copy.evidence.dedicatedHeadcount, { value })],
    next: copy.next.investmentL2,
  };
}

function scoreCapability(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  const evidence: string[] = [];
  const caps = parseCapabilities(p);
  const cert = p.certLevel?.trim();
  const inProgress = p.trainings.filter((t) => t.status === "IN_PROGRESS").length;
  const done = p.trainings.filter((t) => t.status === "DONE").length;

  if (!caps.length && !cert && p.trainings.length === 0) {
    return { level: 0, evidence: [copy.evidence.noCapabilitySignal], next: copy.next.capabilityL0 };
  }
  if (caps.length) evidence.push(fill(copy.evidence.hasCapabilityTags, { n: caps.length }));
  if (cert) evidence.push(fill(copy.evidence.hasCertLevel, { value: cert }));
  if (inProgress) evidence.push(fill(copy.evidence.trainingInProgress, { n: inProgress }));
  if (done) evidence.push(fill(copy.evidence.trainingDone, { n: done }));

  if (done >= 2 || (cert && done >= 1)) {
    return { level: 3, evidence, next: copy.next.capabilityL3 };
  }
  if (inProgress > 0 || done > 0) {
    return { level: 2, evidence, next: copy.next.capabilityL2 };
  }
  return { level: 1, evidence, next: copy.next.capabilityL1 };
}

function scoreCadence(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  const evidence: string[] = [];
  const stage = p.pipelineStage ?? 1;
  const oppCount = p.opportunities.length;
  const recentReviews = p.reviewItems.filter((r) => {
    const t = r.discussedAt ?? r.updatedAt;
    return daysAgo(t) <= 90 && (r.status === "DISCUSSED" || r.status === "CONFIRMED" || !!r.discussedAt);
  });
  const activeOpps = p.opportunities.filter((o) => ACTIVE_OPP.has(o.status)).length;

  if (oppCount === 0 && stage < 3 && recentReviews.length === 0) {
    return { level: 0, evidence: [copy.evidence.noCadenceSignal], next: copy.next.cadenceL0 };
  }

  evidence.push(fill(copy.evidence.pipelineStage, { stage }));
  if (oppCount) evidence.push(fill(copy.evidence.hasOpportunities, { n: oppCount }));
  if (recentReviews.length) evidence.push(fill(copy.evidence.recentReview, { n: recentReviews.length }));
  if (stage >= 3) evidence.push(copy.evidence.systemPartnership);

  if (stage >= 3 || recentReviews.length >= 2) {
    return { level: 3, evidence, next: copy.next.cadenceL3 };
  }
  if (recentReviews.length >= 1 || (stage >= 2 && activeOpps > 0)) {
    return { level: 2, evidence, next: copy.next.cadenceL2 };
  }
  return { level: 1, evidence, next: copy.next.cadenceL1 };
}

function scoreEngagement(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  const stale = staleDays(p);
  const rec30 = p.businessRecords.filter((r) => daysAgo(r.occurredAt) <= 30).length;
  const rec14 = p.businessRecords.filter((r) => daysAgo(r.occurredAt) <= 14).length;
  const evidence = [fill(copy.evidence.staleDays, { n: stale })];
  if (rec30) evidence.push(fill(copy.evidence.recentBusinessRecords, { n: rec30, days: 30 }));

  if (stale < 14 && rec14 > 0) {
    return { level: 3, evidence, next: copy.next.engagementL3 };
  }
  if ((stale >= 14 && stale <= 30) || rec30 > 0) {
    return { level: 2, evidence, next: copy.next.engagementL2 };
  }
  if (stale > 30 && stale <= 60) {
    return { level: 1, evidence, next: copy.next.engagementL1 };
  }
  if (stale > 60) {
    return { level: 0, evidence, next: copy.next.engagementL0 };
  }
  // stale <= 30 but no recent business record — still L2-ish if fresh events
  if (stale <= 30) {
    return { level: 2, evidence, next: copy.next.engagementL2 };
  }
  return { level: 1, evidence, next: copy.next.engagementL1 };
}

function scorePipeline(p: PartnerStatusInput, copy: StatusCopy): { level: StatusLevel; evidence: string[]; next: string } {
  if (p.opportunities.length === 0) {
    return { level: 0, evidence: [copy.evidence.noOpportunities], next: copy.next.pipelineL0 };
  }
  const won = p.opportunities.filter((o) => o.status === "WON").length;
  const mid = p.opportunities.filter((o) => MID_OPP.has(o.status)).length;
  const active = p.opportunities.filter((o) => ACTIVE_OPP.has(o.status)).length;
  const early = p.opportunities.filter((o) => EARLY_OR_PAUSED.has(o.status)).length;
  const evidence: string[] = [fill(copy.evidence.activeOpportunities, { n: active })];
  if (mid) evidence.push(fill(copy.evidence.midOpportunities, { n: mid }));
  if (won) evidence.push(fill(copy.evidence.wonOpportunities, { n: won }));

  if (won > 0 || (active >= 3 && mid > 0)) {
    return { level: 3, evidence, next: copy.next.pipelineL3 };
  }
  if (mid > 0 || active >= 2) {
    return { level: 2, evidence, next: copy.next.pipelineL2 };
  }
  evidence.push(fill(copy.evidence.earlyOpportunities, { n: early || p.opportunities.length }));
  return { level: 1, evidence, next: copy.next.pipelineL1 };
}

const SCORERS: Record<
  StatusDimensionKey,
  (p: PartnerStatusInput, copy: StatusCopy) => { level: StatusLevel; evidence: string[]; next: string }
> = {
  relationship: scoreRelationship,
  solution: scoreSolution,
  investment: scoreInvestment,
  capability: scoreCapability,
  cadence: scoreCadence,
  engagement: scoreEngagement,
  pipeline: scorePipeline,
};

export function computePartnerStatus(
  partner: PartnerStatusInput,
  overridesRaw: string | null | undefined,
  copy: StatusCopy,
): PartnerStatusOverview {
  const overrides = parseStatusOverrides(overridesRaw);
  const dimensions: DimensionStatus[] = STATUS_DIMENSION_KEYS.map((key) => {
    const scored = SCORERS[key](partner, copy);
    const ov = overrides[key];
    const overrideLevel = ov ? clampLevel(ov.level) : null;
    const effectiveLevel = overrideLevel ?? scored.level;
    return {
      key,
      autoLevel: scored.level,
      overrideLevel,
      effectiveLevel,
      evidence: scored.evidence,
      suggestedNext: scored.next,
      note: ov?.note?.trim() || null,
      isOverridden: overrideLevel != null,
    };
  });

  const avg =
    dimensions.reduce((s, d) => s + d.effectiveLevel, 0) / Math.max(dimensions.length, 1);
  const healthScore = Math.round((avg / 3) * 100);

  const minLevel = Math.min(...dimensions.map((d) => d.effectiveLevel));
  const bottlenecks = dimensions
    .filter((d) => d.effectiveLevel === minLevel)
    .map((d) => d.key)
    .slice(0, 2);

  return { dimensions, healthScore, bottlenecks };
}
