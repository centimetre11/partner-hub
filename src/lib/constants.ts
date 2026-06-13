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
  category: "类别",
  tier: "Tier 分级",
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
