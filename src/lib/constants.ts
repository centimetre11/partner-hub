import { labelsEn, stageNameFromLabels, attitudeLabelFromLabels } from "./i18n/labels";

/** English label maps — used for AI prompts and backward-compatible imports */
export const PIPELINE_STAGES = labelsEn.pipelineStages;
export const CATEGORY_LABELS = labelsEn.categoryLabels;
export const INDUSTRY_LABELS = labelsEn.industryLabels;
export const POOL_FLAG_LABELS = labelsEn.poolFlagLabels;
export const STATUS_LABELS = labelsEn.statusLabels;
export const CONTACT_ROLE_LABELS = labelsEn.contactRoleLabels;
export const ATTITUDE_LABELS = labelsEn.attitudeLabels;
export const TODO_PRIORITY_LABELS = labelsEn.todoPriorityLabels;
export const EVENT_TYPE_LABELS = labelsEn.eventTypeLabels;
export const MONITOR_DIMENSION_LABELS = labelsEn.monitorDimensionLabels;
export const MONITOR_SENTIMENT_LABELS = labelsEn.monitorSentimentLabels;
export const MONITOR_SOURCE_TYPE_LABELS = labelsEn.monitorSourceTypeLabels;
export const AI_VERIFIED_LABELS = labelsEn.aiVerifiedLabels;
export const DOCUMENT_TYPE_LABELS = labelsEn.documentTypeLabels;
export const MATERIAL_CATEGORY_LABELS = labelsEn.materialCategoryLabels;
export const KNOWLEDGE_CATEGORY_LABELS = labelsEn.knowledgeCategoryLabels;
export const SOLUTION_STATUS_LABELS = labelsEn.solutionStatusLabels;

export function stageName(stage: number) {
  return stageNameFromLabels(labelsEn, stage);
}

export function attitudeLabel(a: number | null | undefined) {
  return attitudeLabelFromLabels(labelsEn, a);
}

export const CONTACT_ROLE_CODES: Record<string, string> = {
  APPROVER: "A",
  DECISION_MAKER: "D",
  SUPPORTER: "S",
  EVALUATOR: "E",
  INFLUENCER: "I",
};

export const CONTACT_ROLE_INFLUENCE: Record<string, number> = {
  DECISION_MAKER: 5,
  APPROVER: 4,
  EVALUATOR: 3,
  INFLUENCER: 2,
  SUPPORTER: 1,
};

export function roleInfluence(role: string | null | undefined): number {
  return CONTACT_ROLE_INFLUENCE[role ?? ""] ?? 0;
}

export const CONTACT_ROLES_BY_INFLUENCE = Object.keys(CONTACT_ROLE_INFLUENCE).sort(
  (a, b) => CONTACT_ROLE_INFLUENCE[b] - CONTACT_ROLE_INFLUENCE[a],
);

export const MONITOR_DIMENSION_KEYWORDS: Record<string, string> = {
  NEWS: "news announcement product launch",
  PEOPLE: "new CEO CTO appointment hire leadership change",
  HIRING: "hiring jobs careers recruitment BI data analyst",
  DEALS: "contract award tender project win deployment",
  FUNDING: "funding round investment acquisition revenue",
  COMPETITOR: "Power BI Tableau Qlik implementation partner",
  SOCIAL: "LinkedIn Facebook post update",
  REPUTATION: "review rating Glassdoor reputation complaint",
  EVENTS: "event conference webinar exhibition summit",
  ALLIANCE: "Microsoft AWS Google partnership certification",
  RISK: "layoff lawsuit controversy scandal crisis",
};

export const MONITOR_DIMENSIONS = Object.keys(MONITOR_DIMENSION_LABELS);

export const MONITOR_SENTIMENT_TONE: Record<
  string,
  "green" | "zinc" | "amber" | "red"
> = {
  POSITIVE: "green",
  NEUTRAL: "zinc",
  NEGATIVE: "amber",
  RISK: "red",
};

/** Fixed English field names for AI / proposal diff — never localized */
export const PARTNER_FIELD_LABELS: Record<string, string> = {
  name: "Company Name",
  category: "Competitor Category",
  industries: "Primary Industries",
  tier: "Tier",
  partnerArchetype: "Partner Archetype",
  valuePattern: "Joint Value Pattern",
  valuePartnerOffer: "Partner Offers",
  valueFanruanOffer: "Fanruan Offers",
  valueCustomerOutcome: "Customer Value",
  dedicatedHeadcount: "Dedicated Headcount",
  city: "City",
  country: "Country",
  headcount: "Company Size",
  website: "Website",
  companyType: "Company Type",
  coreBusiness: "Core Business",
  capability: "Core Capability",
  knownClients: "Known Clients",
  partnerAnnualRevenue: "Partner Annual Revenue (est.)",
  partnerDealsPerYear: "Deals Per Year (est.)",
  estimatedAnnualValue: "Estimated Annual Value to FanRuan",
  certLevel: "Certification Level",
  currentTools: "Current BI Tools",
  keyDifferentiator: "Key Differentiator",
  playbook: "Core Playbook",
  pitch: "Pitch",
  bestChannel: "Best Contact Channel",
  fitScore: "Fit Score",
  pipelineStage: "Pipeline Stage",
  notes: "Notes",
};

/** Fixed English field codes for the end-customer (account) AI intake proposal. */
export const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  name: "Customer Name",
  status: "Status",
  industry: "Industry",
  customerSegment: "Customer Segment",
  buyingTrigger: "Buying Trigger",
  entryPath: "Entry Path",
  tier: "Tier",
  scale: "Scale",
  city: "City",
  country: "Country",
  website: "Website",
  contactName: "Primary Contact",
  contactTitle: "Contact Title",
  contactPhone: "Contact Phone",
  contactEmail: "Contact Email",
  notes: "Notes",
};

/** Chinese display labels for the customer intake draft. */
export const CUSTOMER_FIELD_LABELS_ZH: Record<string, string> = {
  name: "客户名称",
  status: "状态",
  industry: "行业",
  customerSegment: "细分客群",
  buyingTrigger: "购买触发点",
  entryPath: "进入路径",
  tier: "Tier",
  scale: "规模",
  city: "城市",
  country: "国家",
  website: "官网",
  contactName: "主联系人",
  contactTitle: "联系人职务",
  contactPhone: "联系电话",
  contactEmail: "联系邮箱",
  notes: "备注",
};
