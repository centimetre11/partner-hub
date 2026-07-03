import type { Contact, Opportunity, Partner, Solution, TimelineEvent, Training } from "@prisma/client";
import { labelsEn, stageNameFromLabels, type LabelsBundle } from "./i18n/labels";
import { formatTierLabel, normalizePartnerTier } from "./tier";
import { labelsFromMap, labelFromMap, parseIndustries, type TaxonomyDimension } from "./taxonomy";

export type WorkspacePanelId = "guide" | "positioning" | "pipeline" | "relationship";

/** @deprecated Use getLabels(locale).partnerArchetypeLabels */
export const PARTNER_ARCHETYPE_LABELS = labelsEn.partnerArchetypeLabels;
/** @deprecated Use getLabels(locale).valuePatternLabels */
export const VALUE_PATTERN_LABELS = labelsEn.valuePatternLabels;
/** @deprecated Use getLabels(locale).actionDomainLabels */
export const ACTION_DOMAIN_LABELS = labelsEn.actionDomainLabels;
/** @deprecated Use getLabels(locale).workspacePanels */
export const WORKSPACE_PANELS = labelsEn.workspacePanels;

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
  annual_value: { panel: "positioning", editable: true },
  stage: { panel: "positioning", editable: true },
  archetype: { panel: "positioning", editable: true },
  category: { panel: "positioning", editable: true },
  industry: { panel: "positioning", editable: true },
  value_pattern: { panel: "positioning", editable: true },
  value_stack: { panel: "positioning", editable: true },
  playbook: { panel: "positioning", editable: true },
  pitch: { panel: "positioning", editable: true },
  domain_commitment: { panel: "positioning", editable: true },
  domain_capability: { panel: "guide" },
  domain_pipeline: { panel: "pipeline" },
  domain_relationship: { panel: "relationship" },
  mod_profile: { panel: "positioning" },
  mod_powermap: { panel: "relationship" },
  mod_opp: { panel: "pipeline" },
  mod_training: { panel: "guide" },
  mod_solution: { panel: "guide" },
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

export function getStageGuidance(p: PartnerFrameworkInput, ui: LabelsBundle = { ...labelsEn, locale: "en" }): StageGuidance {
  const meta = ui.pipelineStages.find((s) => s.stage === p.pipelineStage);
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
    name: meta?.name ?? stageNameFromLabels(ui, p.pipelineStage),
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

function formatAnnualValueSummary(
  p: Pick<Partner, "partnerAnnualRevenue" | "partnerDealsPerYear" | "estimatedAnnualValue">,
  ui: LabelsBundle,
): string {
  const fb = ui.fallbacks;
  if (p.estimatedAnnualValue) return p.estimatedAnnualValue;
  const parts: string[] = [];
  if (p.partnerAnnualRevenue) parts.push(p.partnerAnnualRevenue);
  if (p.partnerDealsPerYear) {
    parts.push(ui.locale === "zh" ? `${p.partnerDealsPerYear}单/年` : `${p.partnerDealsPerYear} deals/yr`);
  }
  if (parts.length) return `${parts.join(" · ")} · ${fb.toBeWritten}`;
  return fb.tbd;
}

export function buildPartnerInstanceMap(
  p: PartnerFrameworkInput,
  labelMaps?: Partial<Record<TaxonomyDimension, Record<string, string>>>,
  ui: LabelsBundle = { ...labelsEn, locale: "en" },
): FrameworkMapNode[] {
  const activeOpps = p.opportunities.filter((o) => o.status === "ACTIVE");
  const stage = p.pipelineStage;
  const guidance = getStageGuidance(p, ui);
  const fb = ui.fallbacks;

  const normalizedTier = normalizePartnerTier(p.tier);
  const tierLabel = normalizedTier ? formatTierLabel(normalizedTier) : fb.unclassified;
  const archetypeLabel = labelFromMap(
    labelMaps?.ARCHETYPE ?? ui.partnerArchetypeLabels,
    p.partnerArchetype,
    fb.tbd,
  );
  const patternLabel = labelFromMap(labelMaps?.VALUE_PATTERN ?? ui.valuePatternLabels, p.valuePattern, fb.notSelected);
  const categoryLabel = labelFromMap(labelMaps?.CATEGORY ?? ui.categoryLabels, p.category, p.category);
  const industryCodes = parseIndustries(p);
  const industryLabel = labelsFromMap(labelMaps?.INDUSTRY ?? ui.industryLabels, industryCodes, fb.tbd);

  const layerPos = ui.frameworkLayerOrder[0] ?? "Positioning";
  const layerPlay = ui.frameworkLayerOrder[1] ?? "Playbook";
  const layerAct = ui.frameworkLayerOrder[2] ?? "Actions";
  const layerExec = ui.frameworkLayerOrder[3] ?? "Execution";
  const layerExit = ui.frameworkLayerOrder[4] ?? "Stage exit";

  const nodes: FrameworkMapNode[] = [
    { id: "tier", layer: layerPos, label: "Tier", hint: "Investment intensity", status: nodeStatus(!!p.tier), value: tierLabel },
    {
      id: "annual_value",
      layer: layerPos,
      label: ui.locale === "zh" ? "年度价值" : "Annual value",
      hint: ui.locale === "zh" ? "从他自身营收与年单量判断" : "From their revenue & deals/year",
      status: nodeStatus(
        !!p.estimatedAnnualValue,
        !!(p.partnerAnnualRevenue || p.partnerDealsPerYear),
      ),
      value: formatAnnualValueSummary(p, ui),
    },
    { id: "stage", layer: layerPos, label: "Stage", hint: "Relationship progress", status: "current", value: `${stage}. ${stageNameFromLabels(ui, stage)}` },
    { id: "archetype", layer: layerPos, label: ui.taxonomyMeta.ARCHETYPE.label, hint: ui.taxonomyMeta.ARCHETYPE.hint, status: nodeStatus(!!p.partnerArchetype && p.partnerArchetype !== "OTHER", !!p.partnerArchetype), value: archetypeLabel },
    { id: "category", layer: layerPos, label: ui.taxonomyMeta.CATEGORY.label, hint: ui.taxonomyMeta.CATEGORY.hint, status: nodeStatus(p.category !== "OTHER"), value: categoryLabel },
    { id: "industry", layer: layerPos, label: ui.taxonomyMeta.INDUSTRY.label, hint: ui.taxonomyMeta.INDUSTRY.hint, status: nodeStatus(industryCodes.length > 0 && !industryCodes.every((c) => c === "OTHER"), industryCodes.length > 0), value: industryLabel },
    { id: "value_pattern", layer: layerPlay, label: ui.taxonomyMeta.VALUE_PATTERN.label, hint: ui.taxonomyMeta.VALUE_PATTERN.hint, status: nodeStatus(!!p.valuePattern), value: patternLabel },
    {
      id: "value_stack",
      layer: layerPlay,
      label: ui.locale === "zh" ? "价值三行" : "Value triple",
      hint: ui.locale === "zh" ? "伙伴+帆软+客户" : "Partner + FanRuan + Customer",
      status: nodeStatus(!!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome), !!(p.valuePartnerOffer || p.valueFanruanOffer)),
      value: p.valuePartnerOffer ? fb.partiallyFilled : fb.toBeWritten,
    },
    { id: "playbook", layer: layerPlay, label: "playbook", hint: ui.locale === "zh" ? "怎么打" : "How to win", status: nodeStatus(!!p.playbook, false), value: p.playbook ? fb.captured : fb.toBeWritten },
    { id: "pitch", layer: layerPlay, label: "pitch", hint: ui.locale === "zh" ? "30 秒话术" : "30-second pitch", status: nodeStatus(!!p.pitch), value: p.pitch ? fb.ready : fb.toBeWritten },
    {
      id: "domain_commitment",
      layer: layerAct,
      label: ui.actionDomainLabels.COMMITMENT,
      hint: ui.locale === "zh" ? "专人/Owner" : "Dedicated staff / Sales & pre-sales",
      status: nodeStatus(
        !!(p.salesUserId || p.ownerId) && !!p.presalesUserId && !!p.dedicatedHeadcount,
        !!(p.salesUserId || p.ownerId) || !!p.presalesUserId,
      ),
      value: [
        p.salesUser?.name ?? p.owner?.name ?? fb.noSales,
        p.presalesUser?.name ?? fb.noPresales,
        p.dedicatedHeadcount ? `${p.dedicatedHeadcount} ${fb.people}` : fb.dedicatedTbd,
      ].filter(Boolean).join(" · "),
    },
    {
      id: "domain_capability",
      layer: layerAct,
      label: ui.actionDomainLabels.CAPABILITY,
      hint: ui.locale === "zh" ? "培训/Demo/方案" : "Training / Demo / Solutions",
      status: nodeStatus(p.trainings.length > 0 && (p.solutions.length > 0 || stage < 5), p.trainings.length > 0),
      value: ui.locale === "zh" ? `培训 ${p.trainings.length} · 方案 ${p.solutions.length}` : `Training ${p.trainings.length} · Solutions ${p.solutions.length}`,
    },
    {
      id: "domain_pipeline",
      layer: layerAct,
      label: ui.actionDomainLabels.PIPELINE,
      hint: ui.locale === "zh" ? "商机节奏" : "Opportunity cadence",
      status: nodeStatus(activeOpps.length > 0 && (stage < 5 || activeOpps.some((o) => o.nextStep)), activeOpps.length > 0),
      value: `${activeOpps.length} ${fb.active}`,
    },
    {
      id: "domain_relationship",
      layer: layerAct,
      label: ui.actionDomainLabels.RELATIONSHIP,
      hint: ui.locale === "zh" ? "权力/接触" : "Power / touchpoints",
      status: nodeStatus(p.contacts.length >= 2 && p.contacts.some((c) => c.role === "DECISION_MAKER"), p.contacts.length > 0),
      value: `${p.contacts.length} ${fb.contacts} · ${p.events.length} ${fb.activities}`,
    },
    { id: "mod_profile", layer: layerExec, label: ui.locale === "zh" ? "伙伴画像" : "Partner profile", status: nodeStatus(!!p.coreBusiness), value: fb.jumpDown },
    { id: "mod_powermap", layer: layerExec, label: ui.locale === "zh" ? "权力地图" : "Power map", status: nodeStatus(p.contacts.length > 0), value: `${p.contacts.length} ${fb.people}` },
    { id: "mod_opp", layer: layerExec, label: ui.locale === "zh" ? "商机跟踪" : "Opportunity tracking", status: nodeStatus(p.opportunities.length > 0), value: `${p.opportunities.length} ${fb.records}` },
    { id: "mod_training", layer: layerExec, label: ui.locale === "zh" ? "能力培训" : "Capability training", status: nodeStatus(p.trainings.length > 0), value: `${p.trainings.length} ${fb.records}` },
    { id: "mod_solution", layer: layerExec, label: ui.locale === "zh" ? "联合方案" : "Joint solutions", status: nodeStatus(p.solutions.length > 0), value: `${p.solutions.length} ${fb.records}` },
    { id: "mod_timeline", layer: layerExec, label: ui.locale === "zh" ? "动态时间线" : "Activity timeline", status: nodeStatus(p.events.length > 0), value: `${p.events.length} ${fb.records}` },
    {
      id: "stage_exit",
      layer: layerExit,
      label: ui.locale === "zh" ? `阶段 ${stage} 准出` : `Stage ${stage} exit`,
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
      hint: `${n.hint ?? n.label} · ${fb.clickView}${t.editable ? fb.clickEdit : ""}`,
    };
  });
}

/** Overall framework reference map (no partner data) */
export function buildFrameworkReferenceMap(ui: LabelsBundle = { ...labelsEn, locale: "en" }): FrameworkMapNode[] {
  const [layerPos, layerPlay, layerAct, layerExec] = ui.frameworkLayerOrder;
  const layers: { layer: string; nodes: { id: string; label: string; hint: string }[] }[] = [
    {
      layer: layerPos,
      nodes: [
        { id: "tier", label: "Tier A/B/C", hint: ui.locale === "zh" ? "决定投入强度与接触频率" : "Drives investment intensity and touch frequency" },
        { id: "annual_value", label: ui.locale === "zh" ? "年度价值" : "Annual value", hint: ui.locale === "zh" ? "从他自身营收与年单量判断能为帆软带来多少" : "Estimate FanRuan value from their revenue & deals/year" },
        { id: "stage", label: "Stage 1–10", hint: ui.locale === "zh" ? "决定本阶段必做动作" : "Drives required actions for this stage" },
        { id: "archetype", label: ui.taxonomyMeta.ARCHETYPE.label, hint: ui.taxonomyMeta.ARCHETYPE.hint },
        { id: "category", label: ui.taxonomyMeta.CATEGORY.label, hint: ui.taxonomyMeta.CATEGORY.hint },
        { id: "industry", label: ui.taxonomyMeta.INDUSTRY.label, hint: ui.taxonomyMeta.INDUSTRY.hint },
      ],
    },
    {
      layer: layerPlay,
      nodes: [
        { id: "value_pattern", label: ui.taxonomyMeta.VALUE_PATTERN.label, hint: ui.taxonomyMeta.VALUE_PATTERN.hint },
        { id: "value_stack", label: ui.locale === "zh" ? "价值三行" : "Value triple", hint: ui.locale === "zh" ? "伙伴提供 · 帆软提供 · 客户得到" : "Partner offers · FanRuan offers · Customer gets" },
        { id: "playbook", label: "playbook", hint: ui.locale === "zh" ? "这套模式怎么打" : "How to win with this pattern" },
        { id: "pitch", label: "pitch", hint: ui.locale === "zh" ? "对外 30 秒话术" : "External 30-second pitch" },
      ],
    },
    {
      layer: layerAct,
      nodes: [
        { id: "domain_commitment", label: ui.actionDomainLabels.COMMITMENT, hint: ui.locale === "zh" ? "Owner · dedicated 人数 · org chart" : "Owner · dedicated headcount · org chart" },
        { id: "domain_capability", label: ui.actionDomainLabels.CAPABILITY, hint: ui.locale === "zh" ? "认证 · Demo · 联合方案" : "Certification · Demo · Joint solutions" },
        { id: "domain_pipeline", label: ui.actionDomainLabels.PIPELINE, hint: ui.locale === "zh" ? "ACTIVE 商机 · sync 节奏 · 首单" : "ACTIVE opportunities · sync cadence · first deal" },
        { id: "domain_relationship", label: ui.actionDomainLabels.RELATIONSHIP, hint: ui.locale === "zh" ? "权力地图 · 接触 · champion" : "Power map · touchpoints · champion" },
      ],
    },
    {
      layer: layerExec,
      nodes: [
        { id: "mod_profile", label: ui.locale === "zh" ? "伙伴画像" : "Partner profile", hint: ui.locale === "zh" ? "基本信息与类型" : "Basic info and type" },
        { id: "mod_powermap", label: ui.locale === "zh" ? "权力地图" : "Power map", hint: "A/D/S/E/I framework" },
        { id: "mod_opp", label: ui.locale === "zh" ? "商机跟踪" : "Opportunity tracking", hint: ui.locale === "zh" ? "具体 Pipeline 单子" : "Specific pipeline deals" },
        { id: "mod_training", label: ui.locale === "zh" ? "能力培训" : "Capability training", hint: "FCA certification plan" },
        { id: "mod_solution", label: ui.locale === "zh" ? "联合方案" : "Joint solutions", hint: ui.locale === "zh" ? "价值模式的具体实例" : "Concrete instances of value pattern" },
        { id: "mod_timeline", label: ui.locale === "zh" ? "动态时间线" : "Activity timeline", hint: ui.locale === "zh" ? "接触与变更审计" : "Touchpoints and change audit" },
      ],
    },
  ];

  return layers.flatMap(({ layer, nodes }) =>
    nodes.map((n) => ({ ...n, layer, status: "info" as MapNodeStatus })),
  );
}

export function groupMapByLayer(nodes: FrameworkMapNode[], ui: LabelsBundle = { ...labelsEn, locale: "en" }) {
  const map = new Map<string, FrameworkMapNode[]>();
  for (const n of nodes) {
    if (!map.has(n.layer)) map.set(n.layer, []);
    map.get(n.layer)!.push(n);
  }
  return ui.frameworkLayerOrder.filter((l) => map.has(l)).map((layer) => ({ layer, nodes: map.get(layer)! }));
}
