import type { Contact, Opportunity, Partner, Solution, TimelineEvent, Training } from "@prisma/client";
import { CATEGORY_LABELS, INDUSTRY_LABELS, PIPELINE_STAGES, stageName } from "./constants";
import { labelsFromMap, labelFromMap, parseIndustries, type TaxonomyDimension } from "./taxonomy";

// ============ Enums & labels ============

export const PARTNER_ARCHETYPE_LABELS: Record<string, string> = {
  DATA_NATIVE: "Data-native",
  BI_MIGRATOR: "Competitor migration",
  IT_INTEGRATOR: "General IT integration",
  IOT_INTEGRATOR: "IoT / Smart city",
  SALES_AGENT: "Channel sales only",
  SHELL_DATA: "Shell data company",
  OTHER: "To be validated",
};

export const VALUE_PATTERN_LABELS: Record<string, string> = {
  IOT_DASH: "IoT + Visualization",
  APP_REPORT: "Business systems + Complex reporting",
  CLOUD_APP: "Cloud channel + On-prem apps",
  DATA_BI: "Data governance + BI loop",
  BI_COMPLEMENT: "Competitor complement / Dual stack",
  OEM_EMBED: "OEM / Embedded",
  GOV_BID: "Government joint bidding",
};

export const ACTION_DOMAIN_LABELS: Record<string, string> = {
  COMMITMENT: "Organizational commitment",
  CAPABILITY: "Capability building",
  PIPELINE: "Pipeline advancement",
  RELATIONSHIP: "Relationship management",
};

export type WorkspacePanelId = "guide" | "positioning" | "pipeline" | "capability" | "relationship";

export const WORKSPACE_PANELS: { id: WorkspacePanelId; label: string; desc: string }[] = [
  { id: "guide", label: "Stage guidance", desc: "Stage actions · Todos · AI" },
  { id: "positioning", label: "Positioning playbook", desc: "Tier · Type · Value pattern · Profile" },
  { id: "pipeline", label: "Pipeline", desc: "Pipeline opportunity tracking" },
  { id: "capability", label: "Capability building", desc: "Training certification · Joint solutions" },
  { id: "relationship", label: "Relationship management", desc: "Power map · Activity · Sentiment" },
];

export type MapNodeStatus = "current" | "done" | "partial" | "missing" | "info";

export type FrameworkMapNode = {
  id: string;
  layer: string;
  label: string;
  hint?: string;
  panel?: WorkspacePanelId;
  editable?: boolean;
  status: MapNodeStatus;
  value?: string;
};

/** Instance map node → workspace panel & quick-edit eligibility */
export const INSTANCE_NODE_TARGETS: Record<string, { panel: WorkspacePanelId; editable?: boolean }> = {
  tier: { panel: "positioning", editable: true },
  stage: { panel: "positioning", editable: true },
  archetype: { panel: "positioning", editable: true },
  category: { panel: "positioning", editable: true },
  industry: { panel: "positioning", editable: true },
  value_pattern: { panel: "positioning", editable: true },
  value_stack: { panel: "positioning", editable: true },
  playbook: { panel: "positioning", editable: true },
  pitch: { panel: "positioning", editable: true },
  domain_commitment: { panel: "positioning", editable: true },
  domain_capability: { panel: "capability" },
  domain_pipeline: { panel: "pipeline" },
  domain_relationship: { panel: "relationship" },
  mod_profile: { panel: "positioning" },
  mod_powermap: { panel: "relationship" },
  mod_opp: { panel: "pipeline" },
  mod_training: { panel: "capability" },
  mod_solution: { panel: "capability" },
  mod_timeline: { panel: "relationship" },
  stage_exit: { panel: "guide" },
};

export function panelForNode(nodeId: string): WorkspacePanelId {
  return INSTANCE_NODE_TARGETS[nodeId]?.panel ?? "guide";
}

export type StageGuidance = {
  stage: number;
  name: string;
  focus: string;
  domains: Record<string, string[]>;
  exitChecks: { id: string; label: string; ok: boolean }[];
};

export type PartnerFrameworkInput = Partner & {
  contacts: Contact[];
  opportunities: Opportunity[];
  events: TimelineEvent[];
  trainings: Training[];
  solutions: Solution[];
  owner?: { name: string } | null;
  salesUser?: { name: string } | null;
  presalesUser?: { name: string } | null;
};

// ============ Stage action cards (exit criteria) ============

function hasRecentEvent(events: TimelineEvent[], days: number) {
  return events.some((e) => Date.now() - new Date(e.createdAt).getTime() < days * 24 * 3600 * 1000);
}

function stageExitChecks(p: PartnerFrameworkInput): { id: string; label: string; ok: boolean }[] {
  const stage = p.pipelineStage;
  const activeOpps = p.opportunities.filter((o) => o.status === "ACTIVE");
  const wonOpps = p.opportunities.filter((o) => o.status === "WON");
  const hasDM = p.contacts.some((c) => c.role === "DECISION_MAKER");
  const hasChampion = p.contacts.some((c) => c.attitude >= 2);
  const hasValuePattern = !!p.valuePattern;
  const hasValueTriple = !!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome);
  const trainingActive = p.trainings.some((t) => t.status !== "PLANNED" || t.targetCert);

  const checks: { id: string; label: string; ok: boolean; minStage: number }[] = [
    { id: "owner", label: "Sales & pre-sales assigned", ok: !!(p.salesUserId || p.ownerId) && !!p.presalesUserId, minStage: 2 },
    { id: "archetype", label: "Partner type classified", ok: !!p.partnerArchetype && p.partnerArchetype !== "OTHER", minStage: 3 },
    { id: "data_team", label: "Dedicated data team confirmed (or flagged red to stop)", ok: !!p.dedicatedHeadcount || ["SALES_AGENT", "SHELL_DATA"].includes(p.partnerArchetype ?? ""), minStage: 3 },
    { id: "contacts", label: "Power map ≥2 people", ok: p.contacts.length >= 2, minStage: 3 },
    { id: "value_pattern", label: "Joint value pattern selected", ok: hasValuePattern, minStage: 4 },
    { id: "value_triple", label: "Value triple (partner/FanRuan/customer) documented", ok: hasValueTriple, minStage: 4 },
    { id: "playbook", label: "Playbook captured", ok: !!p.playbook, minStage: 4 },
    { id: "candidate_opp", label: "Named candidate opportunity/client", ok: activeOpps.length > 0 || !!p.knownClients, minStage: 4 },
    { id: "decision_maker", label: "Power map includes decision maker (D)", ok: hasDM, minStage: 4 },
    { id: "active_opp", label: "At least 1 ACTIVE opportunity (with nextStep)", ok: activeOpps.some((o) => !!o.nextStep), minStage: 5 },
    { id: "training", label: "Training/certification plan started", ok: p.trainings.length > 0 && trainingActive, minStage: 5 },
    { id: "solution", label: "At least 1 joint solution", ok: p.solutions.length > 0, minStage: 5 },
    { id: "sync", label: "Touchpoint logged in last 14 days", ok: hasRecentEvent(p.events, 14), minStage: 6 },
    { id: "dedicated", label: "Dedicated headcount recorded", ok: !!p.dedicatedHeadcount, minStage: 7 },
    { id: "first_win", label: "First win or in delivery", ok: wonOpps.length > 0 || stage >= 8, minStage: 8 },
    { id: "ongoing_opp", label: "Ongoing active opportunities", ok: activeOpps.length > 0, minStage: 9 },
  ];

  const relevant = checks.filter((c) => stage >= c.minStage);
  const upToStage = relevant.filter((c) => c.minStage <= stage && c.minStage >= stage - 1);
  return (upToStage.length ? upToStage : relevant.slice(-4)).map(({ id, label, ok }) => ({ id, label, ok }));
}

export function getStageGuidance(p: PartnerFrameworkInput): StageGuidance {
  const meta = PIPELINE_STAGES.find((s) => s.stage === p.pipelineStage);
  const stageCards: Record<number, { focus: string; domains: Record<string, string[]> }> = {
    1: {
      focus: "Quick screen: Are they a data player? Do they have a dedicated data team?",
      domains: {
        COMMITMENT: ["Assign our Owner", "Book first meeting with business lead"],
        CAPABILITY: ["Learn existing tools and team structure", "No training scheduled yet"],
        PIPELINE: ["Ask about last 3 data-related projects", "Don't rush to create opportunities"],
        RELATIONSHIP: ["Start power map with 1–2 people", "Log first touchpoint"],
      },
    },
    2: {
      focus: "Build rapport; classify partner type and decide whether to continue",
      domains: {
        COMMITMENT: ["Both sides have clear Owners", "Confirm follow-up meeting possible"],
        CAPABILITY: ["Assess analytics capability vs. dashboard-only"],
        PIPELINE: ["Learn potential industries/client direction"],
        RELATIONSHIP: ["Log first meeting on timeline", "Power map 1–2 people"],
      },
    },
    3: {
      focus: "Needs diagnosis: classify partner type, start value pattern",
      domains: {
        COMMITMENT: ["Request org chart", "Ask who works full-time on data/FanRuan"],
        CAPABILITY: ["Assess certification and demo readiness"],
        PIPELINE: ["Name 1–2 joint target clients from known clients"],
        RELATIONSHIP: ["Power map ≥3 people", "Find internal champion"],
      },
    },
    4: {
      focus: "Solution presentation: lock value pattern; demo only this story",
      domains: {
        COMMITMENT: ["Tier A: aim to meet D"],
        CAPABILITY: ["Schedule product demo", "Update playbook + pitch"],
        PIPELINE: ["Log candidate opportunities in system"],
        RELATIONSHIP: ["Confirm champion attitude ≥ supportive"],
      },
    },
    5: {
      focus: "POC: bind opportunity, launch training plan",
      domains: {
        COMMITMENT: ["Confirm POC effort from both sides (person-days)"],
        CAPABILITY: ["≥2 people in certification/training", "Create joint solution"],
        PIPELINE: ["Must have 1 ACTIVE opportunity", "Document nextStep + followUp"],
        RELATIONSHIP: ["Agree biweekly opportunity sync"],
      },
    },
    6: {
      focus: "Commercial negotiation: keep momentum, update opportunities on schedule",
      domains: {
        COMMITMENT: ["Tier A: weekly sync"],
        CAPABILITY: ["Close demo → POC delivery loop"],
        PIPELINE: ["Negotiate discount/terms/first-deal path"],
        RELATIONSHIP: ["Must have touchpoint in last 14 days"],
      },
    },
    7: {
      focus: "Contract onboarding: dedicated team, cert targets, kickoff",
      domains: {
        COMMITMENT: ["Confirm PS + Sales handoff", "Record dedicated headcount"],
        CAPABILITY: ["Set L2/L3 cert targets by Tier"],
        PIPELINE: ["Document first-deal path"],
        RELATIONSHIP: ["Log contract kickoff on timeline"],
      },
    },
    8: {
      focus: "First delivery: validate value pattern",
      domains: {
        COMMITMENT: ["Our Owner stays engaged"],
        CAPABILITY: ["Apply for onsite support/subsidy as needed"],
        PIPELINE: ["First deal WON or in delivery"],
        RELATIONSHIP: ["Add delivery contacts to power map"],
      },
    },
    9: {
      focus: "Deep partnership: rolling opportunity pool + joint GTM",
      domains: {
        COMMITMENT: ["Shared pipeline targets"],
        CAPABILITY: ["Advanced certification, independent presales"],
        PIPELINE: ["Regular pipeline review"],
        RELATIONSHIP: ["Quarterly business review"],
      },
    },
    10: {
      focus: "Strategic partner: exclusive / co-investment level partnership",
      domains: {
        COMMITMENT: ["Annual joint plan"],
        CAPABILITY: ["Joint solution library, ≥2 independent wins"],
        PIPELINE: ["90-day rolling opportunity pool"],
        RELATIONSHIP: ["Consider strategic tag upgrade"],
      },
    },
  };

  const card = stageCards[p.pipelineStage] ?? stageCards[2];
  return {
    stage: p.pipelineStage,
    name: meta?.name ?? stageName(p.pipelineStage),
    focus: card.focus,
    domains: card.domains,
    exitChecks: stageExitChecks(p),
  };
}

// ============ Instance map node status ============

function nodeStatus(ok: boolean, partial?: boolean, current?: boolean): MapNodeStatus {
  if (current) return "current";
  if (ok) return "done";
  if (partial) return "partial";
  return "missing";
}

export function buildPartnerInstanceMap(
  p: PartnerFrameworkInput,
  labelMaps?: Partial<Record<TaxonomyDimension, Record<string, string>>>,
): FrameworkMapNode[] {
  const activeOpps = p.opportunities.filter((o) => o.status === "ACTIVE");
  const stage = p.pipelineStage;
  const guidance = getStageGuidance(p);

  const tierLabel = p.tier ? `Tier ${p.tier}` : "Unclassified";
  const archetypeLabel = labelFromMap(
    labelMaps?.ARCHETYPE ?? PARTNER_ARCHETYPE_LABELS,
    p.partnerArchetype,
    "To be determined",
  );
  const patternLabel = labelFromMap(labelMaps?.VALUE_PATTERN ?? VALUE_PATTERN_LABELS, p.valuePattern, "Not selected");
  const categoryLabel = labelFromMap(labelMaps?.CATEGORY ?? CATEGORY_LABELS, p.category, p.category);
  const industryCodes = parseIndustries(p);
  const industryLabel = labelsFromMap(labelMaps?.INDUSTRY ?? INDUSTRY_LABELS, industryCodes, "To be determined");

  const nodes: FrameworkMapNode[] = [
    // Positioning layer
    { id: "tier", layer: "Positioning", label: "Tier", hint: "Investment intensity", status: nodeStatus(!!p.tier), value: tierLabel },
    { id: "stage", layer: "Positioning", label: "Stage", hint: "Relationship progress", status: "current", value: `${stage}. ${stageName(stage)}` },
    { id: "archetype", layer: "Positioning", label: "Partner type", hint: "How to engage", status: nodeStatus(!!p.partnerArchetype && p.partnerArchetype !== "OTHER", !!p.partnerArchetype), value: archetypeLabel },
    { id: "category", layer: "Positioning", label: "Competitive DNA", hint: "Background", status: nodeStatus(p.category !== "OTHER"), value: categoryLabel },
    { id: "industry", layer: "Positioning", label: "Primary industry", hint: "Target vertical", status: nodeStatus(industryCodes.length > 0 && !industryCodes.every((c) => c === "OTHER"), industryCodes.length > 0), value: industryLabel },

    // Playbook layer
    { id: "value_pattern", layer: "Playbook", label: "Value pattern", hint: "What we sell together", status: nodeStatus(!!p.valuePattern), value: patternLabel },
    {
      id: "value_stack",
      layer: "Playbook",
      label: "Value triple",
      hint: "Partner + FanRuan + Customer",
      status: nodeStatus(!!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome), !!(p.valuePartnerOffer || p.valueFanruanOffer)),
      value: p.valuePartnerOffer ? "Partially filled" : "To be written",
    },
    { id: "playbook", layer: "Playbook", label: "playbook", hint: "How to win", status: nodeStatus(!!p.playbook, false), value: p.playbook ? "Captured" : "To be written" },
    { id: "pitch", layer: "Playbook", label: "pitch", hint: "30-second pitch", status: nodeStatus(!!p.pitch), value: p.pitch ? "Ready" : "To be written" },

    // Actions layer
    {
      id: "domain_commitment",
      layer: "Actions",
      label: ACTION_DOMAIN_LABELS.COMMITMENT,
      hint: "Dedicated staff / Sales & pre-sales",
      status: nodeStatus(
        !!(p.salesUserId || p.ownerId) && !!p.presalesUserId && !!p.dedicatedHeadcount,
        !!(p.salesUserId || p.ownerId) || !!p.presalesUserId,
      ),
      value: [
        p.salesUser?.name ?? p.owner?.name ?? "No sales",
        p.presalesUser?.name ?? "No pre-sales",
        p.dedicatedHeadcount ? `${p.dedicatedHeadcount} people` : "Dedicated staff TBD",
      ].filter(Boolean).join(" · "),
    },
    {
      id: "domain_capability",
      layer: "Actions",
      label: ACTION_DOMAIN_LABELS.CAPABILITY,
      hint: "Training / Demo / Solutions",
      status: nodeStatus(p.trainings.length > 0 && (p.solutions.length > 0 || stage < 5), p.trainings.length > 0),
      value: `Training ${p.trainings.length} · Solutions ${p.solutions.length}`,
    },
    {
      id: "domain_pipeline",
      layer: "Actions",
      label: ACTION_DOMAIN_LABELS.PIPELINE,
      hint: "Opportunity cadence",
      status: nodeStatus(activeOpps.length > 0 && (stage < 5 || activeOpps.some((o) => o.nextStep)), activeOpps.length > 0),
      value: `${activeOpps.length} active`,
    },
    {
      id: "domain_relationship",
      layer: "Actions",
      label: ACTION_DOMAIN_LABELS.RELATIONSHIP,
      hint: "Power / touchpoints",
      status: nodeStatus(p.contacts.length >= 2 && p.contacts.some((c) => c.role === "DECISION_MAKER"), p.contacts.length > 0),
      value: `${p.contacts.length} contacts · ${p.events.length} activities`,
    },

    // Execution layer
    { id: "mod_profile", layer: "Execution", label: "Partner profile", status: nodeStatus(!!p.coreBusiness), value: "Jump ↓" },
    { id: "mod_powermap", layer: "Execution", label: "Power map", status: nodeStatus(p.contacts.length > 0), value: `${p.contacts.length} people` },
    { id: "mod_opp", layer: "Execution", label: "Opportunity tracking", status: nodeStatus(p.opportunities.length > 0), value: `${p.opportunities.length} records` },
    { id: "mod_training", layer: "Execution", label: "Capability training", status: nodeStatus(p.trainings.length > 0), value: `${p.trainings.length} records` },
    { id: "mod_solution", layer: "Execution", label: "Joint solutions", status: nodeStatus(p.solutions.length > 0), value: `${p.solutions.length} records` },
    { id: "mod_timeline", layer: "Execution", label: "Activity timeline", status: nodeStatus(p.events.length > 0), value: `${p.events.length} records` },

    // Current stage exit (summary node)
    {
      id: "stage_exit",
      layer: "Stage exit",
      label: `Stage ${stage} exit`,
      hint: guidance.focus,
      status: nodeStatus(guidance.exitChecks.every((c) => c.ok), guidance.exitChecks.some((c) => c.ok)),
      value: `${guidance.exitChecks.filter((c) => c.ok).length}/${guidance.exitChecks.length}`,
    },
  ];

  return nodes.map((n) => {
    const t = INSTANCE_NODE_TARGETS[n.id];
    if (!t) return n;
    return {
      ...n,
      panel: t.panel,
      editable: t.editable,
      hint: `${n.hint ?? n.label} · Click to view${t.editable ? " / edit" : ""}`,
    };
  });
}

/** Overall framework reference map (no partner data) */
export function buildFrameworkReferenceMap(): FrameworkMapNode[] {
  const layers: { layer: string; nodes: { id: string; label: string; hint: string }[] }[] = [
    {
      layer: "Positioning",
      nodes: [
        { id: "tier", label: "Tier A/B/C", hint: "Drives investment intensity and touch frequency" },
        { id: "stage", label: "Stage 1–10", hint: "Drives required actions for this stage" },
        { id: "archetype", label: "Partner type", hint: "Drives action branch (continue/watch/stop)" },
        { id: "category", label: "Competitive DNA", hint: "PBI/Tableau/pure data…" },
        { id: "industry", label: "Primary industry", hint: "Banking/government/retail/manufacturing…" },
      ],
    },
    {
      layer: "Playbook",
      nodes: [
        { id: "value_pattern", label: "Joint value pattern", hint: "IoT+dashboard / business systems+reporting / cloud+apps…" },
        { id: "value_stack", label: "Value triple", hint: "Partner offers · FanRuan offers · Customer gets" },
        { id: "playbook", label: "playbook", hint: "How to win with this pattern" },
        { id: "pitch", label: "pitch", hint: "External 30-second pitch" },
      ],
    },
    {
      layer: "Actions",
      nodes: [
        { id: "domain_commitment", label: "Organizational commitment", hint: "Owner · dedicated headcount · org chart" },
        { id: "domain_capability", label: "Capability building", hint: "Certification · Demo · Joint solutions" },
        { id: "domain_pipeline", label: "Pipeline advancement", hint: "ACTIVE opportunities · sync cadence · first deal" },
        { id: "domain_relationship", label: "Relationship management", hint: "Power map · touchpoints · champion" },
      ],
    },
    {
      layer: "Execution",
      nodes: [
        { id: "mod_profile", label: "Partner profile", hint: "Basic info and type" },
        { id: "mod_powermap", label: "Power map", hint: "A/D/S/E/I framework" },
        { id: "mod_opp", label: "Opportunity tracking", hint: "Specific pipeline deals" },
        { id: "mod_training", label: "Capability training", hint: "FCA certification plan" },
        { id: "mod_solution", label: "Joint solutions", hint: "Concrete instances of value pattern" },
        { id: "mod_timeline", label: "Activity timeline", hint: "Touchpoints and change audit" },
      ],
    },
  ];

  return layers.flatMap(({ layer, nodes }) =>
    nodes.map((n) => ({ ...n, layer, status: "info" as MapNodeStatus })),
  );
}

export const FRAMEWORK_LAYER_ORDER = ["Positioning", "Playbook", "Actions", "Execution", "Stage exit"];

export function groupMapByLayer(nodes: FrameworkMapNode[]) {
  const map = new Map<string, FrameworkMapNode[]>();
  for (const n of nodes) {
    if (!map.has(n.layer)) map.set(n.layer, []);
    map.get(n.layer)!.push(n);
  }
  return FRAMEWORK_LAYER_ORDER.filter((l) => map.has(l)).map((layer) => ({ layer, nodes: map.get(layer)! }));
}
