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

export const CONTACT_ROLE_LABELS: Record<string, string> = {
  DECISION_MAKER: "最终决策者",
  TECH_GATEKEEPER: "技术把关人",
  BIZ_LEAD: "商务负责人",
  EXECUTOR: "实际执行者",
  BLOCKER: "潜在反对者",
  OTHER: "其他",
};

export const SUPPORT_LABELS: Record<string, string> = {
  POSITIVE: "支持",
  NEGATIVE: "反对",
  UNKNOWN: "未知",
};

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
