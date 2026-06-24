import type { AutomationVariable } from "./automation-builder-types";
import type { Locale } from "./i18n/locale";

/** Skills for scheduled query → push automations */
export const DEFAULT_AUTOMATION_SKILLS = [
  "list_todos",
  "list_opportunities",
  "get_partner",
  "search_partners",
  "web_search",
  "push_wecom",
  "send_wecom_app",
  "send_email",
] as const;

export function partnerScopeLabel(partnerName: string | undefined, locale: Locale): string {
  if (partnerName?.trim()) return partnerName.trim();
  return locale === "zh" ? "不指定（无伙伴关联）" : "None (not partner-scoped)";
}

export type ScheduledPushParams = {
  goal: string;
  partnerId?: string;
  partnerName?: string;
  wecomPushChatId?: string;
  pushEmailTo?: string;
  dueWithinDays?: number;
  locale?: Locale;
};

export function inferDueWithinDays(goal: string, draftDays?: number): number | undefined {
  if (draftDays != null && Number.isInteger(draftDays) && draftDays > 0) return draftDays;
  const g = goal.trim();
  const zh = g.match(/(\d+)\s*天[^。\n]{0,12}(过期|到期|due)/i);
  if (zh) return parseInt(zh[1], 10);
  const en = g.match(/due[^.\n]{0,24}(\d+)\s*days?/i) || g.match(/within\s+(\d+)\s*days?/i);
  if (en) return parseInt(en[1], 10);
  return undefined;
}

export function isTodoDueGoal(goal: string): boolean {
  return /待办|代办|todo|到期|过期|due\s+(date|within)/i.test(goal);
}

const AUTOMATION_SKILL_ORDER = [
  "list_todos",
  "list_opportunities",
  "web_search",
  "get_partner",
  "search_partners",
  "push_wecom",
  "send_wecom_app",
  "send_email",
] as const;

/** 从任务描述与推送配置推断运行时可能调用的工具 */
export function inferAutomationSkills(input: {
  description?: string;
  taskMd?: string;
  wecomPushChatId?: string;
  pushEmailTo?: string;
  partnerId?: string;
}): string[] {
  const text = `${input.description ?? ""}\n${input.taskMd ?? ""}`;
  const picked = new Set<string>();

  if (/list_todos|待办|代办|todo|到期|过期|due\s+(date|within)/i.test(text)) picked.add("list_todos");
  if (/list_opportunities|商机|opportunit/i.test(text)) picked.add("list_opportunities");
  if (/web_search|投标|招标|新闻|资讯|\bsearch\b/i.test(text)) picked.add("web_search");
  if (input.partnerId?.trim()) picked.add("get_partner");
  else if (/search_partners|哪个伙伴|哪位伙伴|which partner/i.test(text)) picked.add("search_partners");

  if (input.wecomPushChatId?.trim() || /push_wecom|企微群|发到群|推到.*群/i.test(text)) picked.add("push_wecom");
  if (/send_wecom_app|应用消息|私信|推送给.*人|推给.*本人/i.test(text)) picked.add("send_wecom_app");
  if (input.pushEmailTo?.trim() || /send_email|发邮件|发邮箱|邮件给我|email/i.test(text)) picked.add("send_email");

  if (picked.size === 0) {
    for (const s of DEFAULT_AUTOMATION_SKILLS) picked.add(s);
  }

  return AUTOMATION_SKILL_ORDER.filter((s) => picked.has(s));
}

export function buildAutomationVariables(params: ScheduledPushParams): AutomationVariable[] {
  const vars: AutomationVariable[] = [
    { key: "goal", value: params.goal.trim(), label: "Task goal" },
    { key: "partner_id", value: params.partnerId?.trim() ?? "", label: "Partner ID" },
    {
      key: "partner_name",
      value: params.partnerName?.trim() ?? "",
      label: "Partner name",
    },
    { key: "wecom_chat_id", value: params.wecomPushChatId?.trim() ?? "", label: "WeCom chatId" },
    { key: "push_email_to", value: params.pushEmailTo?.trim() ?? "", label: "Email recipient" },
  ];
  if (params.dueWithinDays != null && params.dueWithinDays > 0) {
    vars.push({ key: "due_within_days", value: String(params.dueWithinDays), label: "Due within days" });
  }
  return vars;
}

/** Explicit due-todos pipeline — list_todos(dueWithinDays) → push */
export function buildDueTodosTaskMd(params: ScheduledPushParams): string {
  const isZh = (params.locale ?? "zh") === "zh";
  const days = params.dueWithinDays ?? 3;
  const partnerLine =
    params.partnerId?.trim() || params.partnerName?.trim()
      ? isZh
        ? `伙伴 **{{partner_name}}**（partnerId=\`{{partner_id}}\`）`
        : `partner **{{partner_name}}** (partnerId=\`{{partner_id}}\`)`
      : isZh
        ? "不限单个伙伴（partner_id 为空）"
        : "all partners (partner_id empty)";

  if (isZh) {
    return `---
name: due-todos-push
description: ${params.goal.slice(0, 120)}
---

# 任务目标
{{goal}}

## 范围
${partnerLine}

## 执行步骤（必须按序）
1. 调用 \`list_todos\`：
   - \`dueWithinDays={{due_within_days}}\`（=${days}，含今天起 ${days} 个自然日）
   - 若 \`{{partner_id}}\` 非空：\`partnerId={{partner_id}}\`
   - 否则若 \`{{partner_name}}\` 非空：\`partnerName={{partner_name}}\`
2. 若无 OPEN 待办：输出「✅ 未来 {{due_within_days}} 天内无到期待办」并结束（仍可推送该说明）
3. 若有待办：格式化为 Markdown 列表（标题、截止日期、优先级、负责人）
4. 若 \`{{wecom_chat_id}}\` 非空：\`push_wecom\`（chatId=\`{{wecom_chat_id}}\`）
5. 若 \`{{push_email_to}}\` 非空：\`send_email\`（相同正文）

## 输出
- 简体中文；摘要含条数与是否已推送`;
  }

  return `---
name: due-todos-push
description: ${params.goal.slice(0, 120)}
---

# Goal
{{goal}}

## Scope
${partnerLine}

## Steps (required)
1. \`list_todos\` with dueWithinDays={{due_within_days}} (= ${days} calendar days from today)
   - partnerId={{partner_id}} if set, else partnerName if set
2. Format list or report none due
3. push_wecom / send_email when configured

## Output
- English brief with count`;
}

/** 每日 OPEN 待办（不限到期窗口）→ push */
export function buildOpenTodosTaskMd(params: ScheduledPushParams): string {
  const isZh = (params.locale ?? "zh") === "zh";
  const partnerLine =
    params.partnerId?.trim() || params.partnerName?.trim()
      ? isZh
        ? `伙伴 **{{partner_name}}**（partnerId=\`{{partner_id}}\`）`
        : `partner **{{partner_name}}** (partnerId=\`{{partner_id}}\`)`
      : isZh
        ? "不限单个伙伴（partner_id 为空）"
        : "all partners (partner_id empty)";

  if (isZh) {
    return `---
name: open-todos-push
description: ${params.goal.slice(0, 120)}
---

# 任务目标
{{goal}}

## 范围
${partnerLine}

## 执行步骤（必须按序）
1. 调用 \`list_todos\`（不传 dueWithinDays，查全部 OPEN 待办）：
   - 若 \`{{partner_id}}\` 非空：\`partnerId={{partner_id}}\`
   - 否则若 \`{{partner_name}}\` 非空：\`partnerName={{partner_name}}\`
2. 将工具返回的**每一行**格式化为 Markdown 列表（保留 [id:…]、标题、截止日期、优先级、负责人）
3. 若无 OPEN 待办：正文写「✅ 当前无 OPEN 待办」
4. 若 \`{{wecom_chat_id}}\` 非空：\`push_wecom\`（chatId=\`{{wecom_chat_id}}\`，正文含完整列表）
5. 若 \`{{push_email_to}}\` 非空：\`send_email\`（相同正文）
6. **禁止**只写摘要而不列出具体待办条目

## 输出
- 简体中文；含条数 + 完整列表 + 是否已推送`;
  }

  return `---
name: open-todos-push
description: ${params.goal.slice(0, 120)}
---

# Goal
{{goal}}

## Scope
${partnerLine}

## Steps
1. \`list_todos\` (all OPEN; partnerId/partnerName if set)
2. Format every line; push_wecom / send_email when configured
3. Do NOT summarize away the list`;
}

export function buildScheduledPushTaskMd(params: ScheduledPushParams): string {
  const isZh = (params.locale ?? "zh") === "zh";
  const goal = params.goal.trim() || (isZh ? "定时查询并推送" : "Scheduled query and push");
  const scope =
    params.partnerId?.trim() || params.partnerName?.trim()
      ? isZh
        ? `伙伴 **${params.partnerName || params.partnerId}**（partnerId=\`{{partner_id}}\`）`
        : `partner **${params.partnerName || params.partnerId}** (partnerId=\`{{partner_id}}\`)`
      : isZh
        ? "**无伙伴关联**（partner_id 为空；适用于每日新闻、行业资讯等）"
        : "**not partner-scoped** (partner_id empty; e.g. daily news)";

  if (isZh) {
    return `---
name: scheduled-push
description: ${goal.slice(0, 120)}
---

# 任务目标
{{goal}}

## 数据范围
${scope}

## 可用工具（按目标选用）
- \`list_todos\` — 待办 / 到期（partnerId + dueWithinDays）
- \`list_opportunities\` — 商机（partnerId）
- \`web_search\` — 外部资讯（新闻、招标等；可无 partner_id）
- \`get_partner\` / \`search_partners\`
- \`push_wecom\` / \`send_email\`

## 执行步骤
1. 按任务目标选工具；无 partner_id 时可直接 web_search
2. 无有效结果时简短说明，避免空推送
3. 整理 Markdown 后按配置推送

## 输出
- 简体中文；含结论、条数、是否已推送`;
  }

  return `---
name: scheduled-push
description: ${goal.slice(0, 120)}
---

# Goal
{{goal}}

## Scope
${scope}

## Tools
list_todos, list_opportunities, web_search, push_wecom, send_email

## Steps
Query per goal; format; push if configured`;
}

export function isAuthoritativeTaskMd(taskMd: string): boolean {
  const t = taskMd.trim();
  if (t.length < 60) return false;
  return /list_todos|list_opportunities|web_search/i.test(t) && /执行步骤|Steps/i.test(t);
}

export function pickAutomationTaskMd(params: ScheduledPushParams, draftTaskMd?: string): string {
  if (draftTaskMd?.trim() && isAuthoritativeTaskMd(draftTaskMd)) {
    return draftTaskMd.trim();
  }
  const dueDays = params.dueWithinDays ?? inferDueWithinDays(params.goal);
  if (isTodoDueGoal(params.goal)) {
    if (dueDays) return buildDueTodosTaskMd({ ...params, dueWithinDays: dueDays });
    return buildOpenTodosTaskMd(params);
  }
  return buildScheduledPushTaskMd(params);
}

export function defaultAutomationSlug(hint?: string): string {
  const base = hint?.trim()
    ? hint
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
    : "scheduled";
  return `${base}-push`.slice(0, 64);
}

export function defaultAutomationName(goalOrPartner?: string, locale: Locale = "zh"): string {
  const g = goalOrPartner?.trim();
  if (g) return g.length > 48 ? `${g.slice(0, 45)}…` : g;
  return locale === "zh" ? "定时查询推送" : "Scheduled push";
}
