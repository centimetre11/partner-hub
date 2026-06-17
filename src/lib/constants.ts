export const PIPELINE_STAGES = [
  { stage: 1, name: "Lead Discovery", desc: "Aware of the company, initial assessment" },
  { stage: 2, name: "First Contact", desc: "LinkedIn / events / referrals, establish contact" },
  { stage: 3, name: "Needs Diagnosis", desc: "Understand partner pain points, capabilities, intent" },
  { stage: 4, name: "Solution Presentation", desc: "Technical demo + commercial proposal" },
  { stage: 5, name: "POC / Trial", desc: "2-month free trial or POC project" },
  { stage: 6, name: "Commercial Negotiation", desc: "Discount, terms, contract negotiation" },
  { stage: 7, name: "Contract & Onboarding", desc: "Sign contract + certification training" },
  { stage: 8, name: "First Delivery", desc: "First joint project" },
  { stage: 9, name: "Deep Engagement", desc: "Ongoing collaboration + upgrade" },
  { stage: 10, name: "Strategic Partner", desc: "Exclusive agency / joint investment" },
] as const;

export function stageName(stage: number) {
  return PIPELINE_STAGES.find((s) => s.stage === stage)?.name ?? `Stage ${stage}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  PURE_DATA: "Pure Data Consulting",
  POWER_BI: "Power BI Partner",
  TABLEAU: "Tableau Partner",
  QLIK: "Qlik Partner",
  IT_INTEGRATOR: "IT Integrator",
  OTHER: "Other",
};

/** Partner primary industries (orthogonal to competitor category) */
export const INDUSTRY_LABELS: Record<string, string> = {
  BANKING: "Banking & Finance",
  GOVERNMENT: "Government & Public",
  OIL_GAS: "Oil & Gas / Energy",
  RETAIL: "Retail & FMCG",
  MANUFACTURING: "Manufacturing",
  HEALTHCARE: "Healthcare",
  TELECOM: "Telecom",
  REAL_ESTATE: "Real Estate",
  LOGISTICS: "Logistics & Supply Chain",
  HOSPITALITY: "Hospitality & Travel",
  EDUCATION: "Education",
  MEDIA: "Media & Advertising",
  CROSS: "Cross-industry",
  OTHER: "Other / TBD",
};

export const POOL_FLAG_LABELS: Record<string, string> = {
  NEW: "New Candidate",
  ADVANCING: "Advancing",
  WATCHING: "Watching",
  DROPPED: "Dropped",
};

export const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active Partner",
  ARCHIVED: "Archived",
};

// Power map roles (A/D/S/E/I system)
export const CONTACT_ROLE_LABELS: Record<string, string> = {
  APPROVER: "Approver",
  DECISION_MAKER: "Decision Maker",
  SUPPORTER: "Supporter",
  EVALUATOR: "Evaluator",
  INFLUENCER: "Influencer",
};

export const CONTACT_ROLE_CODES: Record<string, string> = {
  APPROVER: "A",
  DECISION_MAKER: "D",
  SUPPORTER: "S",
  EVALUATOR: "E",
  INFLUENCER: "I",
};

// Role influence order: D > A > E > I > S
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

// Attitude: 3 Coach / 2 Support exclusive / 1 Support non-exclusive / 0 Neutral / -1 Opposed
export const ATTITUDE_LABELS: Record<number, string> = {
  3: "Coach",
  2: "Support (exclusive)",
  1: "Support (non-exclusive)",
  0: "Not contacted / Neutral",
  [-1]: "Opposed",
};

export function attitudeLabel(a: number | null | undefined) {
  return ATTITUDE_LABELS[a ?? 0] ?? "Not contacted / Neutral";
}

export const TODO_PRIORITY_LABELS: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  NOTE: "Note",
  MEETING: "Meeting Notes",
  CHAT_IMPORT: "Chat Import",
  AI_SUMMARY: "AI Summary",
  NEWS: "External Update",
  SYSTEM: "System",
  CHANGE: "Profile Change",
};

// ============ Sentiment Monitor ============

export const MONITOR_DIMENSION_LABELS: Record<string, string> = {
  NEWS: "Company News",
  PEOPLE: "People Changes",
  HIRING: "Hiring Signals",
  DEALS: "Wins / Projects",
  FUNDING: "Funding / Finance",
  COMPETITOR: "Competitor Relations",
  SOCIAL: "Social Media",
  REPUTATION: "Reputation / Reviews",
  EVENTS: "Events / Conferences",
  ALLIANCE: "Ecosystem / Certifications",
  RISK: "Risk Alerts",
};

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

export const MONITOR_SENTIMENT_LABELS: Record<string, string> = {
  POSITIVE: "Positive / Opportunity",
  NEUTRAL: "Neutral",
  NEGATIVE: "Negative",
  RISK: "High Risk",
};

export const MONITOR_SENTIMENT_TONE: Record<
  string,
  "green" | "zinc" | "amber" | "red"
> = {
  POSITIVE: "green",
  NEUTRAL: "zinc",
  NEGATIVE: "amber",
  RISK: "red",
};

export const MONITOR_SOURCE_TYPE_LABELS: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  FACEBOOK: "Facebook",
  X: "X / Twitter",
  WEBSITE: "Website",
  NEWS: "News Source",
  CUSTOM: "Custom",
};

export const AI_VERIFIED_LABELS: Record<string, string> = {
  VERIFIED: "AI Verified",
  PARTIAL: "Partial Info",
  UNKNOWN: "Unverified",
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  AGENT_BRIEF: "Agent Brief",
  JOINT_SOLUTION: "Joint Solution Report",
  MEETING: "Meeting Notes",
  STRATEGY: "Strategy Analysis",
  CUSTOM: "Custom",
};

export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  TIER_POLICY: "Partner Tier Policy",
  PRODUCT_COMPARE: "Product Comparison",
  PITCH_DECK: "Pitch Materials",
  OTHER: "Other",
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  COMPANY: "Company Overview",
  STRATEGY: "Strategy & Policy",
  PRODUCT: "Product Capabilities",
  GTM: "Regional GTM Playbook",
  COMPETITOR: "Competitive Intelligence",
};

export const SOLUTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const PARTNER_FIELD_LABELS: Record<string, string> = {
  name: "Company Name",
  category: "Competitor Category",
  industry: "Primary Industry (single, legacy)",
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
  coreBusiness: "Core Business",
  capability: "Core Capability",
  knownClients: "Known Clients",
  currentTools: "Current Tools",
  playbook: "Core Playbook",
  pitch: "Pitch",
  bestChannel: "Best Contact Channel",
  fitScore: "Fit Score",
  priority: "Priority",
  pipelineStage: "Pipeline Stage",
  notes: "Notes",
};
