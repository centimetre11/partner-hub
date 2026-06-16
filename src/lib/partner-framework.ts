import type { Contact, Opportunity, Partner, Solution, TimelineEvent, Training } from "@prisma/client";
import { CATEGORY_LABELS, INDUSTRY_LABELS, PIPELINE_STAGES, stageName } from "./constants";

// ============ 枚举与标签 ============

export const PARTNER_ARCHETYPE_LABELS: Record<string, string> = {
  DATA_NATIVE: "数据原生",
  BI_MIGRATOR: "竞品迁移",
  IT_INTEGRATOR: "泛 IT 集成",
  IOT_INTEGRATOR: "IoT / 智慧城市",
  SALES_AGENT: "纯渠道代理",
  SHELL_DATA: "空壳数据公司",
  OTHER: "待验证",
};

export const VALUE_PATTERN_LABELS: Record<string, string> = {
  IOT_DASH: "IoT + 可视化",
  APP_REPORT: "业务系统 + 复杂报表",
  CLOUD_APP: "云渠道 + 私有化应用",
  DATA_BI: "数据治理 + BI 闭环",
  BI_COMPLEMENT: "竞品互补 / 双持",
  OEM_EMBED: "OEM / 嵌入式",
  GOV_BID: "政府联合投标",
};

export const ACTION_DOMAIN_LABELS: Record<string, string> = {
  COMMITMENT: "组织投入",
  CAPABILITY: "能力建设",
  PIPELINE: "商机推进",
  RELATIONSHIP: "关系经营",
};

export type WorkspacePanelId = "guide" | "positioning" | "pipeline" | "capability" | "relationship";

export const WORKSPACE_PANELS: { id: WorkspacePanelId; label: string; desc: string }[] = [
  { id: "guide", label: "阶段指导", desc: "本阶段动作 · 待办 · AI" },
  { id: "positioning", label: "定位打法", desc: "Tier · 类型 · 价值模式 · 画像" },
  { id: "pipeline", label: "商机推进", desc: "Pipeline 商机跟踪" },
  { id: "capability", label: "能力建设", desc: "培训认证 · 联合方案" },
  { id: "relationship", label: "关系经营", desc: "权力地图 · 动态 · 舆情" },
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

/** 实例地图节点 → 工作区面板 & 是否可快捷编辑 */
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
};

// ============ 阶段动作卡（准出条件） ============

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
    { id: "owner", label: "双方 Owner 明确（我方负责 BD）", ok: !!p.ownerId, minStage: 2 },
    { id: "archetype", label: "伙伴类型已判定", ok: !!p.partnerArchetype && p.partnerArchetype !== "OTHER", minStage: 3 },
    { id: "data_team", label: "已确认 dedicated data team（或已标红灯停止）", ok: !!p.dedicatedHeadcount || ["SALES_AGENT", "SHELL_DATA"].includes(p.partnerArchetype ?? ""), minStage: 3 },
    { id: "contacts", label: "权力地图 ≥2 人", ok: p.contacts.length >= 2, minStage: 3 },
    { id: "value_pattern", label: "联合价值模式已选定", ok: hasValuePattern, minStage: 4 },
    { id: "value_triple", label: "价值三行（伙伴/帆软/客户）已写清", ok: hasValueTriple, minStage: 4 },
    { id: "playbook", label: "打法 playbook 已沉淀", ok: !!p.playbook, minStage: 4 },
    { id: "candidate_opp", label: "有指名候选商机/客户", ok: activeOpps.length > 0 || !!p.knownClients, minStage: 4 },
    { id: "decision_maker", label: "权力地图含决策者 D", ok: hasDM, minStage: 4 },
    { id: "active_opp", label: "至少 1 个 ACTIVE 商机（含 nextStep）", ok: activeOpps.some((o) => !!o.nextStep), minStage: 5 },
    { id: "training", label: "培训/认证计划已启动", ok: p.trainings.length > 0 && trainingActive, minStage: 5 },
    { id: "solution", label: "至少 1 条联合解决方案", ok: p.solutions.length > 0, minStage: 5 },
    { id: "sync", label: "近 14 天有接触记录", ok: hasRecentEvent(p.events, 14), minStage: 6 },
    { id: "dedicated", label: "专职人数已记录", ok: !!p.dedicatedHeadcount, minStage: 7 },
    { id: "first_win", label: "首单赢单或交付中", ok: wonOpps.length > 0 || stage >= 8, minStage: 8 },
    { id: "ongoing_opp", label: "持续有进行中商机", ok: activeOpps.length > 0, minStage: 9 },
  ];

  const relevant = checks.filter((c) => stage >= c.minStage);
  const upToStage = relevant.filter((c) => c.minStage <= stage && c.minStage >= stage - 1);
  return (upToStage.length ? upToStage : relevant.slice(-4)).map(({ id, label, ok }) => ({ id, label, ok }));
}

export function getStageGuidance(p: PartnerFrameworkInput): StageGuidance {
  const meta = PIPELINE_STAGES.find((s) => s.stage === p.pipelineStage);
  const stageCards: Record<number, { focus: string; domains: Record<string, string[]> }> = {
    1: {
      focus: "快速筛：是不是数据领域玩家，有没有 dedicated data team",
      domains: {
        COMMITMENT: ["我方指定 Owner", "首次接触约到业务负责人"],
        CAPABILITY: ["了解现有 BI 工具与团队构成", "还不排培训"],
        PIPELINE: ["问最近 3 个数据类项目", "不急着建商机"],
        RELATIONSHIP: ["权力地图先放 1–2 人", "记首次接触"],
      },
    },
    2: {
      focus: "建立联系，初步判定伙伴类型与是否继续",
      domains: {
        COMMITMENT: ["双方 Owner 明确", "确认能否二次约会议"],
        CAPABILITY: ["判断有没有 analytics 能力 vs 只会大屏"],
        PIPELINE: ["了解潜在行业/客户方向"],
        RELATIONSHIP: ["时间线记录首次会议", "权力地图 1–2 人"],
      },
    },
    3: {
      focus: "需求诊断：定伙伴类型，开始写价值模式",
      domains: {
        COMMITMENT: ["要 org chart", "问谁全职做数据/帆软"],
        CAPABILITY: ["了解认证与 Demo 基础"],
        PIPELINE: ["从 known clients 指名 1–2 个可联合客户"],
        RELATIONSHIP: ["权力地图 ≥3 人", "找内部 champion"],
      },
    },
    4: {
      focus: "方案呈现：定价值模式，Demo 只讲这一套故事",
      domains: {
        COMMITMENT: ["Tier A 尽量见到 D"],
        CAPABILITY: ["安排产品 Demo", "更新 playbook + pitch"],
        PIPELINE: ["候选商机写入系统"],
        RELATIONSHIP: ["确认 champion 态度 ≥ 支持"],
      },
    },
    5: {
      focus: "POC：绑定商机，培训计划上线",
      domains: {
        COMMITMENT: ["确认 POC 双方投入人天"],
        CAPABILITY: ["≥2 人进入认证/培训", "建联合 Solution"],
        PIPELINE: ["必须 1 个 ACTIVE 商机", "写清 nextStep + followUp"],
        RELATIONSHIP: ["约定双周商机 sync"],
      },
    },
    6: {
      focus: "商务谈判：节奏不掉，商机按时更新",
      domains: {
        COMMITMENT: ["Tier A 每周 sync"],
        CAPABILITY: ["Demo→POC 交付闭环"],
        PIPELINE: ["谈折扣/条款/首单路径"],
        RELATIONSHIP: ["近 14 天必须有接触记录"],
      },
    },
    7: {
      focus: "签约 Onboarding：专职团队、认证目标、启动会",
      domains: {
        COMMITMENT: ["确认 PS + Sales 对接", "记录 dedicated 人数"],
        CAPABILITY: ["按 Tier 定 L2/L3 认证目标"],
        PIPELINE: ["首单路径写清"],
        RELATIONSHIP: ["签约启动会进时间线"],
      },
    },
    8: {
      focus: "首单交付：验证价值模式是否成立",
      domains: {
        COMMITMENT: ["我方 Owner 不撤"],
        CAPABILITY: ["驻场/补贴按需申请"],
        PIPELINE: ["首单 WON 或交付中"],
        RELATIONSHIP: ["交付线联系人补进权力地图"],
      },
    },
    9: {
      focus: "深度绑定：滚动商机池 + 联合 GTM",
      domains: {
        COMMITMENT: ["共背 Pipeline 目标"],
        CAPABILITY: ["进阶认证、独立售前"],
        PIPELINE: ["固定 pipeline review"],
        RELATIONSHIP: ["季度业务 review"],
      },
    },
    10: {
      focus: "战略伙伴：独家/联合投资级合作",
      domains: {
        COMMITMENT: ["年度联合计划"],
        CAPABILITY: ["联合方案库、独立赢单 ≥2"],
        PIPELINE: ["90 天滚动商机池"],
        RELATIONSHIP: ["考虑战略标签升级"],
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

// ============ 实例地图节点状态 ============

function nodeStatus(ok: boolean, partial?: boolean, current?: boolean): MapNodeStatus {
  if (current) return "current";
  if (ok) return "done";
  if (partial) return "partial";
  return "missing";
}

export function buildPartnerInstanceMap(p: PartnerFrameworkInput): FrameworkMapNode[] {
  const activeOpps = p.opportunities.filter((o) => o.status === "ACTIVE");
  const stage = p.pipelineStage;
  const guidance = getStageGuidance(p);

  const tierLabel = p.tier ? `Tier ${p.tier}` : "未分级";
  const archetypeLabel = p.partnerArchetype ? PARTNER_ARCHETYPE_LABELS[p.partnerArchetype] : "待判定";
  const patternLabel = p.valuePattern ? VALUE_PATTERN_LABELS[p.valuePattern] : "待选定";
  const categoryLabel = CATEGORY_LABELS[p.category] ?? p.category;
  const industryLabel = p.industry ? (INDUSTRY_LABELS[p.industry] ?? p.industry) : "待判定";

  const nodes: FrameworkMapNode[] = [
    // 定位层
    { id: "tier", layer: "定位层", label: "Tier", hint: "投入强度", status: nodeStatus(!!p.tier), value: tierLabel },
    { id: "stage", layer: "定位层", label: "Stage", hint: "关系进展", status: "current", value: `${stage}. ${stageName(stage)}` },
    { id: "archetype", layer: "定位层", label: "伙伴类型", hint: "怎么带", status: nodeStatus(!!p.partnerArchetype && p.partnerArchetype !== "OTHER", !!p.partnerArchetype), value: archetypeLabel },
    { id: "category", layer: "定位层", label: "竞品基因", hint: "出身", status: nodeStatus(p.category !== "OTHER"), value: categoryLabel },
    { id: "industry", layer: "定位层", label: "主攻行业", hint: "打哪行", status: nodeStatus(!!p.industry && p.industry !== "OTHER", !!p.industry), value: industryLabel },

    // 打法层
    { id: "value_pattern", layer: "打法层", label: "价值模式", hint: "一起卖什么", status: nodeStatus(!!p.valuePattern), value: patternLabel },
    {
      id: "value_stack",
      layer: "打法层",
      label: "价值三行",
      hint: "伙伴+帆软+客户",
      status: nodeStatus(!!(p.valuePartnerOffer && p.valueFanruanOffer && p.valueCustomerOutcome), !!(p.valuePartnerOffer || p.valueFanruanOffer)),
      value: p.valuePartnerOffer ? "已部分填写" : "待写",
    },
    { id: "playbook", layer: "打法层", label: "playbook", hint: "怎么打", status: nodeStatus(!!p.playbook, false), value: p.playbook ? "已沉淀" : "待写" },
    { id: "pitch", layer: "打法层", label: "pitch", hint: "30 秒话术", status: nodeStatus(!!p.pitch), value: p.pitch ? "已有" : "待写" },

    // 动作层
    {
      id: "domain_commitment",
      layer: "动作层",
      label: ACTION_DOMAIN_LABELS.COMMITMENT,
      hint: "专人/Owner",
      status: nodeStatus(!!p.ownerId && !!p.dedicatedHeadcount, !!p.ownerId),
      value: [p.owner?.name ?? "无 BD", p.dedicatedHeadcount ? `${p.dedicatedHeadcount} 人` : "专人待录"].filter(Boolean).join(" · "),
    },
    {
      id: "domain_capability",
      layer: "动作层",
      label: ACTION_DOMAIN_LABELS.CAPABILITY,
      hint: "培训/Demo/方案",
      status: nodeStatus(p.trainings.length > 0 && (p.solutions.length > 0 || stage < 5), p.trainings.length > 0),
      value: `培训 ${p.trainings.length} · 方案 ${p.solutions.length}`,
    },
    {
      id: "domain_pipeline",
      layer: "动作层",
      label: ACTION_DOMAIN_LABELS.PIPELINE,
      hint: "商机节奏",
      status: nodeStatus(activeOpps.length > 0 && (stage < 5 || activeOpps.some((o) => o.nextStep)), activeOpps.length > 0),
      value: `${activeOpps.length} 进行中`,
    },
    {
      id: "domain_relationship",
      layer: "动作层",
      label: ACTION_DOMAIN_LABELS.RELATIONSHIP,
      hint: "权力/接触",
      status: nodeStatus(p.contacts.length >= 2 && p.contacts.some((c) => c.role === "DECISION_MAKER"), p.contacts.length > 0),
      value: `${p.contacts.length} 联系人 · ${p.events.length} 动态`,
    },

    // 落地层
    { id: "mod_profile", layer: "落地层", label: "伙伴画像", status: nodeStatus(!!p.coreBusiness), value: "跳转 ↓" },
    { id: "mod_powermap", layer: "落地层", label: "权力地图", status: nodeStatus(p.contacts.length > 0), value: `${p.contacts.length} 人` },
    { id: "mod_opp", layer: "落地层", label: "商机跟踪", status: nodeStatus(p.opportunities.length > 0), value: `${p.opportunities.length} 条` },
    { id: "mod_training", layer: "落地层", label: "能力培训", status: nodeStatus(p.trainings.length > 0), value: `${p.trainings.length} 条` },
    { id: "mod_solution", layer: "落地层", label: "联合方案", status: nodeStatus(p.solutions.length > 0), value: `${p.solutions.length} 条` },
    { id: "mod_timeline", layer: "落地层", label: "动态时间线", status: nodeStatus(p.events.length > 0), value: `${p.events.length} 条` },

    // 当前阶段准出（摘要节点）
    {
      id: "stage_exit",
      layer: "阶段准出",
      label: `阶段 ${stage} 准出`,
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
      hint: `${n.hint ?? n.label} · 点击查看${t.editable ? " / 编辑" : ""}`,
    };
  });
}

/** 整体框架参考地图（无伙伴数据） */
export function buildFrameworkReferenceMap(): FrameworkMapNode[] {
  const layers: { layer: string; nodes: { id: string; label: string; hint: string }[] }[] = [
    {
      layer: "定位层",
      nodes: [
        { id: "tier", label: "Tier A/B/C", hint: "决定投入强度与接触频率" },
        { id: "stage", label: "Stage 1–10", hint: "决定本阶段必做动作" },
        { id: "archetype", label: "伙伴类型", hint: "决定动作分支（继续/观察/停止）" },
        { id: "category", label: "竞品基因", hint: "PBI/Tableau/纯数据…" },
        { id: "industry", label: "主攻行业", hint: "银行/政府/零售/制造…" },
      ],
    },
    {
      layer: "打法层",
      nodes: [
        { id: "value_pattern", label: "联合价值模式", hint: "IoT+大屏 / 业务系统+报表 / 云+应用…" },
        { id: "value_stack", label: "价值三行", hint: "伙伴提供 · 帆软提供 · 客户得到" },
        { id: "playbook", label: "playbook", hint: "这套模式怎么打" },
        { id: "pitch", label: "pitch", hint: "对外 30 秒话术" },
      ],
    },
    {
      layer: "动作层",
      nodes: [
        { id: "domain_commitment", label: "组织投入", hint: "Owner · dedicated 人数 · org chart" },
        { id: "domain_capability", label: "能力建设", hint: "认证 · Demo · 联合方案" },
        { id: "domain_pipeline", label: "商机推进", hint: "ACTIVE 商机 · sync 节奏 · 首单" },
        { id: "domain_relationship", label: "关系经营", hint: "权力地图 · 接触 · champion" },
      ],
    },
    {
      layer: "落地层",
      nodes: [
        { id: "mod_profile", label: "伙伴画像", hint: "基本信息与类型" },
        { id: "mod_powermap", label: "权力地图", hint: "A/D/S/E/I 体系" },
        { id: "mod_opp", label: "商机跟踪", hint: "具体 Pipeline 单子" },
        { id: "mod_training", label: "能力培训", hint: "FCA 认证计划" },
        { id: "mod_solution", label: "联合方案", hint: "价值模式的具体实例" },
        { id: "mod_timeline", label: "动态时间线", hint: "接触与变更审计" },
      ],
    },
  ];

  return layers.flatMap(({ layer, nodes }) =>
    nodes.map((n) => ({ ...n, layer, status: "info" as MapNodeStatus })),
  );
}

export const FRAMEWORK_LAYER_ORDER = ["定位层", "打法层", "动作层", "落地层", "阶段准出"];

export function groupMapByLayer(nodes: FrameworkMapNode[]) {
  const map = new Map<string, FrameworkMapNode[]>();
  for (const n of nodes) {
    if (!map.has(n.layer)) map.set(n.layer, []);
    map.get(n.layer)!.push(n);
  }
  return FRAMEWORK_LAYER_ORDER.filter((l) => map.has(l)).map((layer) => ({ layer, nodes: map.get(layer)! }));
}
