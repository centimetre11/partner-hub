import type { Locale } from "./i18n/locale";

/** 结构化自动化查询配置 — 把「查什么 / 范围 / 过滤」枚举成确定性参数；source=ai 时回退 LLM */
export type AutomationQuerySource = "todos" | "opportunities" | "ai";
export type AutomationQueryScope = "all" | "partner" | "customer";
export type AutomationDueFilter = "all" | "overdue" | "within_days";
export type AutomationOpportunityStatus = "ALL" | "ACTIVE" | "WON" | "LOST" | "PAUSED";
export type AutomationDealType = "ALL" | "PROJECT" | "PRODUCT";
/** 待办按机会/项目归属过滤 */
export type AutomationTodoLinkFilter = "all" | "project" | "opportunity" | "unlinked";

export type AutomationQuery = {
  source: AutomationQuerySource;
  scope: AutomationQueryScope;
  partnerId?: string;
  customerId?: string;
  /** 待办：负责人（空=全部） */
  assigneeId?: string;
  /** 待办：到期过滤 */
  dueFilter?: AutomationDueFilter;
  dueWithinDays?: number;
  /** 待办：按机会/项目归属过滤 */
  linkFilter?: AutomationTodoLinkFilter;
  /** 商机：状态过滤 */
  opportunityStatus?: AutomationOpportunityStatus;
  /** 商机：成交类型过滤 */
  dealType?: AutomationDealType;
  /** source=ai：自然语言目标，交给 LLM 工具循环 */
  aiGoal?: string;
};

export const DEFAULT_AUTOMATION_QUERY: AutomationQuery = {
  source: "todos",
  scope: "all",
  dueFilter: "all",
  opportunityStatus: "ALL",
};

function clampDays(n: unknown): number | undefined {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 90) return undefined;
  return v;
}

/** 宽松解析任意来源（DB JSON / 表单）→ 规范化 AutomationQuery */
export function parseAutomationQuery(raw: unknown): AutomationQuery | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else {
    return null;
  }

  const source = obj.source;
  if (source !== "todos" && source !== "opportunities" && source !== "ai") return null;

  const scopeRaw = obj.scope;
  const scope: AutomationQueryScope =
    scopeRaw === "partner" || scopeRaw === "customer" ? scopeRaw : "all";

  const dueRaw = obj.dueFilter;
  const dueFilter: AutomationDueFilter =
    dueRaw === "overdue" || dueRaw === "within_days" ? dueRaw : "all";

  const statusRaw = obj.opportunityStatus;
  const opportunityStatus: AutomationOpportunityStatus =
    statusRaw === "ACTIVE" || statusRaw === "WON" || statusRaw === "LOST" || statusRaw === "PAUSED"
      ? statusRaw
      : "ALL";

  const dealRaw = obj.dealType;
  const dealType: AutomationDealType =
    dealRaw === "PROJECT" || dealRaw === "PRODUCT" ? dealRaw : "ALL";

  const linkRaw = obj.linkFilter;
  const linkFilter: AutomationTodoLinkFilter =
    linkRaw === "project" || linkRaw === "opportunity" || linkRaw === "unlinked" ? linkRaw : "all";

  const query: AutomationQuery = {
    source,
    scope,
    partnerId: scope === "partner" ? String(obj.partnerId ?? "").trim() || undefined : undefined,
    customerId: scope === "customer" ? String(obj.customerId ?? "").trim() || undefined : undefined,
    assigneeId: source === "todos" ? String(obj.assigneeId ?? "").trim() || undefined : undefined,
    dueFilter: source === "todos" ? dueFilter : undefined,
    dueWithinDays:
      source === "todos" && dueFilter === "within_days" ? clampDays(obj.dueWithinDays) ?? 3 : undefined,
    linkFilter: source === "todos" ? linkFilter : undefined,
    opportunityStatus: source === "opportunities" ? opportunityStatus : undefined,
    dealType: source === "opportunities" ? dealType : undefined,
    aiGoal: source === "ai" ? String(obj.aiGoal ?? "").trim() || undefined : undefined,
  };
  return query;
}

export function serializeAutomationQuery(query: AutomationQuery): string {
  return JSON.stringify(query);
}

/** 该配置能否走确定性管道（无需 LLM） */
export function isDeterministicQuery(query: AutomationQuery | null): query is AutomationQuery {
  return !!query && (query.source === "todos" || query.source === "opportunities");
}

/** 运行时可能用到的工具名（用于 skills 推断 / 预览） */
export function querySkills(query: AutomationQuery): string[] {
  if (query.source === "todos") return ["list_todos"];
  if (query.source === "opportunities") return ["list_opportunities"];
  return ["list_todos", "list_opportunities", "web_search", "get_partner", "search_partners"];
}

/** 人类可读摘要（预览/运行历史用） */
export function describeAutomationQuery(
  query: AutomationQuery,
  ctx: { partnerName?: string; customerName?: string; assigneeName?: string },
  locale: Locale = "zh"
): string {
  const zh = locale === "zh";
  const scopeLabel =
    query.scope === "partner"
      ? zh
        ? `伙伴：${ctx.partnerName || query.partnerId || "?"}`
        : `partner: ${ctx.partnerName || query.partnerId || "?"}`
      : query.scope === "customer"
        ? zh
          ? `客户：${ctx.customerName || query.customerId || "?"}`
          : `customer: ${ctx.customerName || query.customerId || "?"}`
        : zh
          ? "全部"
          : "all";

  if (query.source === "ai") {
    return zh ? `AI 兜底：${query.aiGoal || "自定义目标"}` : `AI: ${query.aiGoal || "custom goal"}`;
  }

  if (query.source === "opportunities") {
    const status =
      query.opportunityStatus && query.opportunityStatus !== "ALL"
        ? `（${query.opportunityStatus}）`
        : "";
    const deal =
      query.dealType === "PROJECT"
        ? zh ? " · 项目型" : " · project-based"
        : query.dealType === "PRODUCT"
          ? zh ? " · 纯产品型" : " · product-only"
          : "";
    return zh ? `商机 · ${scopeLabel}${status}${deal}` : `Opportunities · ${scopeLabel}${status}${deal}`;
  }

  const who = ctx.assigneeName
    ? zh
      ? ` · 负责人：${ctx.assigneeName}`
      : ` · assignee: ${ctx.assigneeName}`
    : "";
  const due =
    query.dueFilter === "overdue"
      ? zh
        ? " · 仅已逾期"
        : " · overdue only"
      : query.dueFilter === "within_days"
        ? zh
          ? ` · ${query.dueWithinDays ?? 3} 天内到期`
          : ` · due in ${query.dueWithinDays ?? 3}d`
        : "";
  const link =
    query.linkFilter === "project"
      ? zh ? " · 仅项目" : " · project-linked"
      : query.linkFilter === "opportunity"
        ? zh ? " · 仅商机" : " · deal-linked"
        : query.linkFilter === "unlinked"
          ? zh ? " · 未挂机会/项目" : " · unlinked"
          : "";
  return zh ? `待办 · ${scopeLabel}${who}${due}${link}` : `Todos · ${scopeLabel}${who}${due}${link}`;
}

/** 结构化自动化的 instructions（确定性管道不依赖它执行，仅供可读 + 编辑回显 + AI 兜底参考） */
export function buildStructuredInstructions(
  query: AutomationQuery,
  ctx: { partnerName?: string; customerName?: string; assigneeName?: string },
  locale: Locale = "zh"
): string {
  const summary = describeAutomationQuery(query, ctx, locale);
  if (locale === "zh") {
    return `# 结构化自动化（确定性管道）
${summary}

执行由 queryConfig 直接驱动（直查数据库 → 格式化 → 按配置推送），不调用大模型，零 Token。

\`\`\`json
${serializeAutomationQuery(query)}
\`\`\``;
  }
  return `# Structured automation (deterministic pipeline)
${summary}

Driven directly by queryConfig (DB query → format → push). No LLM, zero token.

\`\`\`json
${serializeAutomationQuery(query)}
\`\`\``;
}

/** 从自然语言目标推断结构化查询（AI 构建器/旧草案 → queryConfig） */
export function deriveAutomationQueryFromGoal(opts: {
  goal: string;
  partnerId?: string;
  dueWithinDays?: number;
}): AutomationQuery {
  const goal = opts.goal ?? "";
  const scope: AutomationQueryScope = opts.partnerId?.trim() ? "partner" : "all";
  const partnerId = opts.partnerId?.trim() || undefined;

  const isOpportunity = /商机|opportunit/i.test(goal);
  const isTodo = /待办|代办|todo|到期|过期|due\s+(date|within)/i.test(goal);
  // 需要外部信息（新闻/招标/网搜/综合）→ 交给 AI 兜底
  const needsAi = /新闻|资讯|招标|投标|搜索|web|news|tender|bid|linkedin|动态/i.test(goal);

  if (isOpportunity && !needsAi) {
    return { source: "opportunities", scope, partnerId, opportunityStatus: "ALL" };
  }
  if (isTodo && !needsAi) {
    const days = opts.dueWithinDays;
    return {
      source: "todos",
      scope,
      partnerId,
      dueFilter: days && days > 0 ? "within_days" : "all",
      dueWithinDays: days && days > 0 ? days : undefined,
    };
  }
  return { source: "ai", scope, partnerId, aiGoal: goal.trim() || undefined };
}

/** 结构化查询运行时工具 + 推送渠道 */
export function resolveQueryRuntimeSkills(
  query: AutomationQuery,
  channels: { wecomPushChatId?: string | null; pushEmailTo?: string | null; pushWecomAppTo?: string | null }
): string[] {
  const skills = new Set<string>(querySkills(query));
  if (channels.wecomPushChatId?.trim()) skills.add("push_wecom");
  if (channels.pushWecomAppTo?.trim()) skills.add("send_wecom_app");
  if (channels.pushEmailTo?.trim()) skills.add("send_email");
  return [...skills];
}
