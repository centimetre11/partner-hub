import type { Locale } from "./i18n/locale";
import { labelsEn } from "./i18n/labels/en";
import { labelsZh } from "./i18n/labels/zh";
import type { WeeklyReportConfig } from "./weekly-report-config";

/** 周报邮件与 AI 叙述使用的语言（与 UI locale 对齐） */
export type WeeklyReportLocale = Locale;

export type WeeklyReportUserRef = {
  id: string;
  name: string;
  email: string | null;
  reportLocale?: string | null;
  wecomDisplayName?: string | null;
  crmSalesmanName?: string | null;
};

export type WeeklyReportCopy = {
  locale: WeeklyReportLocale;
  timezoneLabel: string;
  none: string;
  overdue: string;
  projectPrefix: string;
  opportunityPrefix: string;
  dealTypeProject: string;
  dealTypeProduct: string;
  faqCreated: string;
  faqUpdated: string;
  faqVerified: string;
  faqCategories: Record<string, string>;
  sections: {
    doneTodos: string;
    businessRecords: string;
    workLogs: string;
    faqEntries: string;
    newCustomers: string;
    upcomingTodos: string;
    activeOpportunities: string;
    activeProjects: string;
    aiNarrative: string;
  };
  statCards: {
    doneTodos: string;
    businessRecords: string;
    workLogs: string;
    faqEntries: string;
    newCustomers: string;
  };
  email: {
    personalSubject: (label: string) => string;
    personalTitle: (name: string) => string;
    period: (label: string) => string;
    testSubject: (name: string, label: string) => string;
    footer: string;
    noNarrative: string;
  };
  managerDigest: {
    subject: (label: string) => string;
    title: string;
    period: (label: string, count: number) => string;
    totals: (done: number, br: number, faq: number, cust: number) => string;
    memberStats: (name: string, done: number, br: number, faq: number, cust: number) => string;
    highlightsTitle: string;
    footer: string;
    noActivity: string;
    noNarrative: string;
    table: {
      member: string;
      doneTodos: string;
      businessRecords: string;
      faqEntries: string;
      newCustomers: string;
      upcomingTodos: string;
      activeOpportunities: string;
    };
    rowLine: (s: {
      name: string;
      doneTodos: number;
      businessRecords: number;
      faqEntries: number;
      newCustomers: number;
      upcomingTodos: number;
      activeOpportunities: number;
    }) => string;
  };
  narrative: {
    system: string;
    user: string;
    fallbackNextWithWork: string;
    fallbackNextEmpty: string;
    fallbackSummary: (counts: {
      doneTodos: number;
      businessRecords: number;
      workLogs: number;
      faqEntries: number;
      newCustomers: number;
    }) => string;
  };
  promptStatsHeader: (name: string, label: string) => string;
};

const COPY_ZH: WeeklyReportCopy = {
  locale: "zh",
  timezoneLabel: "利雅得时间",
  none: "无",
  overdue: "，已逾期",
  projectPrefix: "项目",
  opportunityPrefix: "商机",
  dealTypeProject: "项目型",
  dealTypeProduct: "纯产品型",
  faqCreated: "新增",
  faqUpdated: "更新",
  faqVerified: "，已认证",
  faqCategories: labelsZh.faqCategoryLabels as Record<string, string>,
  sections: {
    doneTodos: "已完成待办",
    businessRecords: "商务记录",
    workLogs: "项目工作记录",
    faqEntries: "问答库贡献",
    newCustomers: "新增客户",
    upcomingTodos: "下周待办",
    activeOpportunities: "活跃商机",
    activeProjects: "进行中合作项目",
    aiNarrative: "本周小结与下周计划（AI 生成）",
  },
  statCards: {
    doneTodos: "完成待办",
    businessRecords: "商务记录",
    workLogs: "项目工作记录",
    faqEntries: "问答库",
    newCustomers: "新增客户",
  },
  email: {
    personalSubject: (label) => `📊 你的本周工作周报（${label}）`,
    personalTitle: (name) => `📊 ${name} 的本周工作周报`,
    period: (label) => `统计周期：${label}（利雅得时间）`,
    testSubject: (name, label) => `📊【试发】${name} 的本周工作周报（${label}）`,
    footer: "本邮件由 Partner Hub 周报自动化生成。数据来自系统记录，建议部分由 AI 生成，仅供参考。",
    noNarrative: "（暂无内容）",
  },
  managerDigest: {
    subject: (label) => `📈 团队周报汇总（${label}）`,
    title: "📈 团队周报汇总",
    period: (label, count) => `统计周期：${label}（利雅得时间） · 共 ${count} 人`,
    totals: (done, br, faq, cust) =>
      `本周合计：完成待办 <b>${done}</b> · 商务记录 <b>${br}</b> · 问答库 <b>${faq}</b> · 新增客户 <b>${cust}</b>`,
    memberStats: (name, done, br, faq, cust) =>
      `（待办 ${done} · 商务 ${br} · 问答 ${faq} · 客户 ${cust}）`,
    highlightsTitle: "📝 各成员本周要点摘录",
    footer: "本邮件由 Partner Hub 周报自动化生成。灰色行表示本周无统计活动；要点摘录来自各成员 AI 周报正文。",
    noActivity: "（本周无统计活动）",
    noNarrative: "（暂无 AI 小结）",
    table: {
      member: "成员",
      doneTodos: "完成待办",
      businessRecords: "商务记录",
      faqEntries: "问答库",
      newCustomers: "新增客户",
      upcomingTodos: "下周待办",
      activeOpportunities: "活跃商机",
    },
    rowLine: (s) =>
      `${s.name}: 完成待办 ${s.doneTodos} | 商务记录 ${s.businessRecords} | 问答库 ${s.faqEntries} | 新增客户 ${s.newCustomers} | 下周待办 ${s.upcomingTodos} | 活跃商机 ${s.activeOpportunities}`,
  },
  narrative: {
    system:
      "你是中东 BI 伙伴管理团队的周报助手。根据给定的本周工作数据，用简体中文撰写周报正文。" +
      "严格分两部分：\n" +
      "【本周小结】用一段话提炼本周亮点与进展（结合完成待办、商务记录、项目工作记录、问答库贡献、新增客户）。\n" +
      "【下周计划与建议】基于「下周待办」和「活跃商机」给出 3-5 条具体、可执行的建议，按优先级排列。\n" +
      "要求：语气专业、简洁、积极；只依据给定数据，绝不编造数字或客户；如某类数据为空可如实指出。不要重复罗列全部明细（明细邮件里已有），重在洞察与建议。",
    user: "请按上述要求输出周报正文（两部分），不要加额外标题层级，不要使用 Markdown 代码块。",
    fallbackNextWithWork: "下周计划：请关注上述「下周待办」与「活跃商机」，优先推进逾期项与高阶段商机。",
    fallbackNextEmpty: "下周计划：本周暂无待办与活跃商机，建议主动开拓新客户与商机。",
    fallbackSummary: ({ doneTodos, businessRecords, workLogs, faqEntries, newCustomers }) =>
      `本周小结：完成待办 ${doneTodos} 项，商务记录 ${businessRecords} 条，项目工作记录 ${workLogs} 条，问答库贡献 ${faqEntries} 条，新增客户 ${newCustomers} 个。`,
  },
  promptStatsHeader: (name, label) => `# ${name} 本周数据（${label}）`,
};

const COPY_EN: WeeklyReportCopy = {
  locale: "en",
  timezoneLabel: "Riyadh time",
  none: "None",
  overdue: ", overdue",
  projectPrefix: "Project",
  opportunityPrefix: "Opportunity",
  dealTypeProject: "Project deal",
  dealTypeProduct: "Product-only",
  faqCreated: "Added",
  faqUpdated: "Updated",
  faqVerified: ", verified",
  faqCategories: labelsEn.faqCategoryLabels as Record<string, string>,
  sections: {
    doneTodos: "Completed to-dos",
    businessRecords: "Business records",
    workLogs: "Project work logs",
    faqEntries: "Q&A library contributions",
    newCustomers: "New customers",
    upcomingTodos: "Upcoming to-dos",
    activeOpportunities: "Active opportunities",
    activeProjects: "Active projects",
    aiNarrative: "Weekly summary & next-week plan (AI)",
  },
  statCards: {
    doneTodos: "To-dos done",
    businessRecords: "Business records",
    workLogs: "Work logs",
    faqEntries: "Q&A library",
    newCustomers: "New customers",
  },
  email: {
    personalSubject: (label) => `📊 Your weekly work report (${label})`,
    personalTitle: (name) => `📊 ${name}'s weekly work report`,
    period: (label) => `Period: ${label} (${COPY_EN.timezoneLabel})`,
    testSubject: (name, label) => `📊 [Test] ${name}'s weekly work report (${label})`,
    footer:
      "This email was generated by Partner Hub weekly automation. Figures come from system records; suggestions are AI-generated for reference only.",
    noNarrative: "(No content)",
  },
  managerDigest: {
    subject: (label) => `📈 Team weekly digest (${label})`,
    title: "📈 Team weekly digest",
    period: (label, count) => `Period: ${label} (${COPY_EN.timezoneLabel}) · ${count} member(s)`,
    totals: (done, br, faq, cust) =>
      `Team totals: to-dos done <b>${done}</b> · business records <b>${br}</b> · Q&A <b>${faq}</b> · new customers <b>${cust}</b>`,
    memberStats: (name, done, br, faq, cust) =>
      `(to-dos ${done} · business ${br} · Q&A ${faq} · customers ${cust})`,
    highlightsTitle: "📝 Member highlights",
    footer:
      "Generated by Partner Hub weekly automation. Grey rows mean no tracked activity; excerpts are from each member's AI narrative.",
    noActivity: "(No tracked activity this week)",
    noNarrative: "(No AI summary)",
    table: {
      member: "Member",
      doneTodos: "To-dos done",
      businessRecords: "Business",
      faqEntries: "Q&A",
      newCustomers: "Customers",
      upcomingTodos: "Next week",
      activeOpportunities: "Opportunities",
    },
    rowLine: (s) =>
      `${s.name}: to-dos ${s.doneTodos} | business ${s.businessRecords} | Q&A ${s.faqEntries} | customers ${s.newCustomers} | next-week ${s.upcomingTodos} | opportunities ${s.activeOpportunities}`,
  },
  narrative: {
    system:
      "You are the weekly report assistant for a Middle East BI partner team. Based on the given weekly data, write the report body in English." +
      " Use exactly two parts:\n" +
      "[This week] One paragraph on highlights and progress (completed to-dos, business records, project work logs, Q&A contributions, new customers).\n" +
      "[Next week] 3–5 concrete, actionable suggestions from upcoming to-dos and active opportunities, prioritized.\n" +
      "Tone: professional, concise, positive. Use only the provided data — never invent numbers or customers. If a category is empty, say so. Do not repeat every line item (the email already lists details); focus on insight and recommendations.",
    user: "Output the report body in the two parts above. Do not add extra heading levels or Markdown code fences.",
    fallbackNextWithWork:
      "Next week: Focus on upcoming to-dos and active opportunities; prioritize overdue items and late-stage deals.",
    fallbackNextEmpty:
      "Next week: No open to-dos or active opportunities this week — consider proactively pursuing new customers and deals.",
    fallbackSummary: ({ doneTodos, businessRecords, workLogs, faqEntries, newCustomers }) =>
      `This week: ${doneTodos} to-do(s) completed, ${businessRecords} business record(s), ${workLogs} work log(s), ${faqEntries} Q&A contribution(s), ${newCustomers} new customer(s).`,
  },
  promptStatsHeader: (name, label) => `# ${name} — week of ${label}`,
};

export function getWeeklyReportCopy(locale: WeeklyReportLocale): WeeklyReportCopy {
  return locale === "en" ? COPY_EN : COPY_ZH;
}

export function normalizeWeeklyReportLocale(raw: unknown): WeeklyReportLocale | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "en" || v === "english") return "en";
  if (v === "zh" || v === "chinese" || v === "cn") return "zh";
  return null;
}

/** 用于匹配配置里「英文周报」名单的用户标识 */
export function weeklyReportUserTokens(user: WeeklyReportUserRef): string[] {
  const tokens = [user.name, user.email?.split("@")[0], user.wecomDisplayName, user.crmSalesmanName];
  return [...new Set(tokens.map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean))];
}

function matchesEnglishRecipients(tokens: string[], englishRecipients: string[]): boolean {
  const set = new Set(tokens);
  return englishRecipients.some((raw) => {
    const t = raw.trim().toLowerCase();
    return t && set.has(t);
  });
}

/**
 * 解析单人周报语言（可复用于其他异步通知渠道）：
 * 1. 自动化配置 englishRecipients → en
 * 2. 用户 reportLocale 偏好
 * 3. 团队默认 defaultReportLocale（默认 zh）
 */
export function resolveWeeklyReportLocale(
  user: WeeklyReportUserRef,
  config: Pick<WeeklyReportConfig, "englishRecipients" | "defaultReportLocale">
): WeeklyReportLocale {
  const tokens = weeklyReportUserTokens(user);
  if (config.englishRecipients?.length && matchesEnglishRecipients(tokens, config.englishRecipients)) {
    return "en";
  }
  const preferred = normalizeWeeklyReportLocale(user.reportLocale);
  if (preferred) return preferred;
  return config.defaultReportLocale ?? "zh";
}

export function buildWeeklyReportLocaleMap(
  users: WeeklyReportUserRef[],
  config: Pick<WeeklyReportConfig, "englishRecipients" | "defaultReportLocale">
): Map<string, WeeklyReportLocale> {
  return new Map(users.map((u) => [u.id, resolveWeeklyReportLocale(u, config)]));
}
