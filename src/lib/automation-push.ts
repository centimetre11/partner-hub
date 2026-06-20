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
  "send_email",
] as const;

export function partnerScopeLabel(partnerName: string | undefined, locale: Locale): string {
  if (partnerName?.trim()) return partnerName.trim();
  return locale === "zh" ? "全部伙伴" : "All partners";
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

export function buildAutomationVariables(params: ScheduledPushParams): AutomationVariable[] {
  const vars: AutomationVariable[] = [
    { key: "goal", value: params.goal.trim(), label: "Task goal" },
    { key: "partner_id", value: params.partnerId?.trim() ?? "", label: "Partner ID" },
    { key: "partner_name", value: params.partnerName?.trim() ?? "", label: "Partner name" },
    { key: "wecom_chat_id", value: params.wecomPushChatId?.trim() ?? "", label: "WeCom chatId" },
    { key: "push_email_to", value: params.pushEmailTo?.trim() ?? "", label: "Email recipient" },
  ];
  if (params.dueWithinDays != null && params.dueWithinDays > 0) {
    vars.push({ key: "due_within_days", value: String(params.dueWithinDays), label: "Due within days" });
  }
  return vars;
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
        ? "**全部伙伴**（partner_id 为空时不限单个伙伴）"
        : "**all partners** (when partner_id is empty)";

  const dueHint =
    params.dueWithinDays != null && params.dueWithinDays > 0
      ? isZh
        ? `\n- 待办场景可用 \`list_todos\` + \`dueWithinDays={{due_within_days}}\`（${params.dueWithinDays} 天）`
        : `\n- For todos: \`list_todos\` with dueWithinDays={{due_within_days}} (${params.dueWithinDays} days)`
      : "";

  if (isZh) {
    return `---
name: scheduled-partner-push
description: ${goal.slice(0, 120)}
---

# 任务目标
{{goal}}

## 数据范围
${scope}

## 可用工具（按目标选用）
- \`list_todos\` — 待办 / 到期提醒（可配合 partnerId、dueWithinDays）${dueHint}
- \`list_opportunities\` — 商机列表（partnerId）
- \`web_search\` — 外部资讯（招标、投标、新闻等）
- \`get_partner\` / \`search_partners\` — 解析伙伴
- \`push_wecom\` — chatId=\`{{wecom_chat_id}}\`
- \`send_email\` — to=\`{{push_email_to}}\`

## 执行步骤
1. 根据任务目标选择工具与参数；partner_id 为空时可 search_partners 或查全体
2. 若无有效数据：输出简短说明，避免空推送
3. 整理为 Markdown（标题、要点、链接）
4. 若 \`{{wecom_chat_id}}\` 非空：\`push_wecom\`
5. 若 \`{{push_email_to}}\` 非空：\`send_email\`

## 输出
- 简体中文；含结论、条数、是否已推送`;
  }

  return `---
name: scheduled-partner-push
description: ${goal.slice(0, 120)}
---

# Goal
{{goal}}

## Scope
${scope}

## Tools (pick as needed)
- \`list_todos\` — todos / due reminders${dueHint}
- \`list_opportunities\` — opportunities (partnerId)
- \`web_search\` — external intel (bids, news)
- \`get_partner\` / \`search_partners\`
- \`push_wecom\` / \`send_email\`

## Steps
1. Query per goal; if partner_id empty, search or scan all relevant partners
2. Skip empty spam pushes
3. Format Markdown; push via WeCom and/or email

## Output
- English brief with counts and delivery status`;
}

export function defaultAutomationSlug(hint?: string): string {
  const base = hint?.trim()
    ? hint
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
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
