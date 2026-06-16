export const PIPELINE_STAGES = [
  { stage: 1, name: "线索发现", desc: "知道这家公司，初步评估" },
  { stage: 2, name: "首次接触", desc: "LinkedIn/展会/引荐，建立联系" },
  { stage: 3, name: "需求诊断", desc: "了解伙伴痛点、能力、意愿" },
  { stage: 4, name: "方案呈现", desc: "技术Demo+商务方案展示" },
  { stage: 5, name: "POC/试用", desc: "2个月免费试用或POC项目" },
  { stage: 6, name: "商务谈判", desc: "折扣、条款、合同谈判" },
  { stage: 7, name: "签约Onboarding", desc: "签署合同+认证培训" },
  { stage: 8, name: "首单交付", desc: "第一个联合项目" },
  { stage: 9, name: "深度绑定", desc: "持续合作+升级" },
  { stage: 10, name: "战略伙伴", desc: "独家代理/联合投资" },
] as const;

export function stageName(stage: number) {
  return PIPELINE_STAGES.find((s) => s.stage === stage)?.name ?? `阶段${stage}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  PURE_DATA: "纯数据咨询",
  POWER_BI: "Power BI 伙伴",
  TABLEAU: "Tableau 伙伴",
  QLIK: "Qlik 伙伴",
  IT_INTEGRATOR: "IT 集成商",
  OTHER: "其他",
};

/** 伙伴主攻行业（与竞品基因 category 正交） */
export const INDUSTRY_LABELS: Record<string, string> = {
  BANKING: "银行金融",
  GOVERNMENT: "政府公共",
  OIL_GAS: "油气能源",
  RETAIL: "零售快消",
  MANUFACTURING: "制造工业",
  HEALTHCARE: "医疗健康",
  TELECOM: "电信",
  REAL_ESTATE: "房地产",
  LOGISTICS: "物流供应链",
  HOSPITALITY: "酒店旅游",
  EDUCATION: "教育",
  MEDIA: "媒体广告",
  CROSS: "跨行业",
  OTHER: "其他/待判定",
};

export const POOL_FLAG_LABELS: Record<string, string> = {
  NEW: "新候选",
  ADVANCING: "推进中",
  WATCHING: "观察",
  DROPPED: "已放弃",
};

export const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "候选",
  ACTIVE: "正式伙伴",
  ARCHIVED: "已归档",
};

// 权力地图角色（A/D/S/E/I 体系）
export const CONTACT_ROLE_LABELS: Record<string, string> = {
  APPROVER: "审批者",
  DECISION_MAKER: "决策者",
  SUPPORTER: "支持者",
  EVALUATOR: "评估者",
  INFLUENCER: "影响者",
};

export const CONTACT_ROLE_CODES: Record<string, string> = {
  APPROVER: "A",
  DECISION_MAKER: "D",
  SUPPORTER: "S",
  EVALUATOR: "E",
  INFLUENCER: "I",
};

// 角色影响力排序：D(决策者) > A(审批者) > E(评估者) > I(影响者) > S(支持者)
// 数值越大影响力越高，用于权力地图的节点大小/配色与列表排序
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

// 按影响力从高到低排序的角色 key（D、A、E、I、S）
export const CONTACT_ROLES_BY_INFLUENCE = Object.keys(CONTACT_ROLE_INFLUENCE).sort(
  (a, b) => CONTACT_ROLE_INFLUENCE[b] - CONTACT_ROLE_INFLUENCE[a],
);

// 态度评分：3教练 / 2支持并排他 / 1支持不排他 / 0未接触或中立 / -1反对
export const ATTITUDE_LABELS: Record<number, string> = {
  3: "教练",
  2: "支持并排他",
  1: "支持不排他",
  0: "未接触或中立",
  [-1]: "反对",
};

export function attitudeLabel(a: number | null | undefined) {
  return ATTITUDE_LABELS[a ?? 0] ?? "未接触或中立";
}

export const TODO_PRIORITY_LABELS: Record<string, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  NOTE: "笔记",
  MEETING: "会议纪要",
  CHAT_IMPORT: "聊天记录导入",
  AI_SUMMARY: "AI 摘要",
  NEWS: "外部动态",
  SYSTEM: "系统",
  CHANGE: "档案变更",
};

// ============ 舆情监控 ============

// 11 个监控维度
export const MONITOR_DIMENSION_LABELS: Record<string, string> = {
  NEWS: "公司动态",
  PEOPLE: "人事变动",
  HIRING: "招聘信号",
  DEALS: "中标/项目",
  FUNDING: "融资/财务",
  COMPETITOR: "竞品关系",
  SOCIAL: "社媒动态",
  REPUTATION: "口碑/评价",
  EVENTS: "活动/会议",
  ALLIANCE: "生态/认证",
  RISK: "风险预警",
};

// 维度的搜索关键词（中英文混合，供构造联网搜索 query）
export const MONITOR_DIMENSION_KEYWORDS: Record<string, string> = {
  NEWS: "news announcement product launch 新闻 动态",
  PEOPLE: "new CEO CTO appointment hire leadership change 高管 任命 离职",
  HIRING: "hiring jobs careers recruitment BI data analyst 招聘",
  DEALS: "contract award tender project win deployment 中标 项目 客户",
  FUNDING: "funding round investment acquisition revenue 融资 收购",
  COMPETITOR: "Power BI Tableau Qlik implementation partner 竞品",
  SOCIAL: "LinkedIn Facebook post update 发帖 动态",
  REPUTATION: "review rating Glassdoor reputation complaint 评价 口碑",
  EVENTS: "event conference webinar exhibition summit 展会 会议",
  ALLIANCE: "Microsoft AWS Google partnership certification 合作 认证",
  RISK: "layoff lawsuit controversy scandal crisis 裁员 诉讼 负面",
};

export const MONITOR_DIMENSIONS = Object.keys(MONITOR_DIMENSION_LABELS);

// 4 档情感
export const MONITOR_SENTIMENT_LABELS: Record<string, string> = {
  POSITIVE: "正面/机会",
  NEUTRAL: "中性",
  NEGATIVE: "负面",
  RISK: "高风险",
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
  LINKEDIN: "领英",
  FACEBOOK: "Facebook",
  X: "X / Twitter",
  WEBSITE: "官网",
  NEWS: "新闻源",
  CUSTOM: "自定义",
};

export const AI_VERIFIED_LABELS: Record<string, string> = {
  VERIFIED: "AI已验证",
  PARTIAL: "部分信息",
  UNKNOWN: "未验证",
};

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  AGENT_BRIEF: "Agent 简报",
  JOINT_SOLUTION: "联合方案报告",
  MEETING: "会议纪要",
  STRATEGY: "策略分析",
  CUSTOM: "自定义",
};

export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  TIER_POLICY: "伙伴等级制度",
  PRODUCT_COMPARE: "产品对比",
  PITCH_DECK: "推介材料",
  OTHER: "其他",
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  COMPANY: "公司介绍",
  STRATEGY: "策略政策",
  PRODUCT: "产品能力",
  GTM: "区域打法",
  COMPETITOR: "竞品情报",
};

export const SOLUTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "在用",
  ARCHIVED: "已归档",
};

// 伙伴档案中允许 AI / 表单更新的字段（含中文标签，供 diff 展示和提示词使用）
export const PARTNER_FIELD_LABELS: Record<string, string> = {
  name: "公司全称",
  category: "竞品基因",
  industry: "主攻行业",
  tier: "Tier 分级",
  partnerArchetype: "伙伴类型",
  valuePattern: "联合价值模式",
  valuePartnerOffer: "伙伴提供",
  valueFanruanOffer: "帆软提供",
  valueCustomerOutcome: "客户价值",
  dedicatedHeadcount: "专职人数",
  city: "城市",
  country: "国家",
  headcount: "公司规模",
  website: "官网",
  companyType: "公司类型",
  coreBusiness: "核心业务",
  capability: "核心能力",
  knownClients: "已知客户",
  certLevel: "认证级别",
  currentTools: "现有BI工具",
  keyDifferentiator: "关键差异化",
  playbook: "核心打法",
  pitch: "话术",
  bestChannel: "最佳接触渠道",
  fitScore: "契合度评分",
  priority: "优先级",
  pipelineStage: "Pipeline阶段",
  notes: "备注",
};
