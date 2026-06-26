import "server-only";

import type { Agent, Partner, User } from "@prisma/client";
import { enqueueWecomPush } from "./wecom-push";
import { getWecomChatByChatId } from "./wecom-chats";
import { db } from "./db";
import {
  hasAutomationDeliveryChannel,
  isWecomAppPushEnabled,
  PUSH_WECOM_APP_ASSIGNEES,
} from "./automation-delivery";
import { inferDueWithinDays, isTodoDueGoal } from "./automation-push";
import {
  type AutomationQuery,
  describeAutomationQuery,
  isDeterministicQuery,
  parseAutomationQuery,
} from "./automation-query";
import { queryTodos, queryOpportunities, type TodoRow, type OpportunityRow } from "./automation-data";
import { runSendWecomAppMessageTool } from "./skill-actions/send-wecom-app-message";
import { runSendEmailTool } from "./skill-actions/send-email";

export type ToolLogEntry = { tool: string; args: unknown; result: string };

export type AgentForPipeline = Agent & { partner?: Partner | null; createdBy?: User | null };

/** 「推给我 / 推给本人」——比 mentionsMyEmail 更宽 */
export function mentionsPushToSelf(...texts: (string | null | undefined)[]): boolean {
  const blob = texts.filter(Boolean).join("\n");
  return /推给我|推给.*本人|推送到.*我|发给我|推送?给.*我\b|to me\b/i.test(blob);
}

/** 旧自动化（无 queryConfig）从 instructions/description 推断结构化待办查询，保持零 Token */
function detectLegacyTodoQuery(agent: AgentForPipeline): AutomationQuery | null {
  const instructions = agent.instructions ?? "";
  const goal = [agent.description, agent.name].filter(Boolean).join("\n");
  const looksTodo =
    /name:\s*(open|due)-todos-push/i.test(instructions) ||
    isTodoDueGoal(goal) ||
    /list_todos|OPEN 待办|待办推送/i.test(instructions);
  if (!looksTodo) return null;

  const scope: AutomationQuery["scope"] = agent.partnerId ? "partner" : "all";
  let dueFilter: AutomationQuery["dueFilter"] = "all";
  let dueWithinDays: number | undefined;
  if (/name:\s*due-todos-push/i.test(instructions) || /到期|过期|due/i.test(goal)) {
    const days = inferDueWithinDays(goal);
    if (days) {
      dueFilter = "within_days";
      dueWithinDays = days;
    }
  }
  return {
    source: "todos",
    scope,
    partnerId: agent.partnerId ?? undefined,
    dueFilter,
    dueWithinDays,
  };
}

/** 解析自动化的查询配置：优先结构化 queryConfig，回退旧自动化推断 */
export function resolveAutomationQuery(agent: AgentForPipeline): AutomationQuery | null {
  const structured = parseAutomationQuery(agent.queryConfig);
  if (structured) return structured;
  return detectLegacyTodoQuery(agent);
}

function pipelineLocale(agent: AgentForPipeline): "zh" | "en" {
  const sample = `${agent.description ?? ""}\n${agent.instructions}`.slice(0, 800);
  return /[\u4e00-\u9fff]/.test(sample) ? "zh" : "en";
}

function formatTodoLine(t: TodoRow, locale: "zh" | "en"): string {
  const due = t.dueDate?.toISOString().slice(0, 10) ?? "-";
  if (locale === "zh") {
    return `- [id:${t.id}] ${t.title} | 伙伴:${t.partner?.name ?? "-"} | 客户:${t.customer?.name ?? "-"} | 截止:${due} | 负责人:${t.assignee?.name ?? "-"}`;
  }
  return `- [id:${t.id}] ${t.title} | Partner:${t.partner?.name ?? "-"} | Customer:${t.customer?.name ?? "-"} | Due:${due} | Assignee:${t.assignee?.name ?? "-"}`;
}

function formatOpportunityLine(o: OpportunityRow, locale: "zh" | "en"): string {
  if (locale === "zh") {
    return `- [id:${o.id}] ${o.name} | 客户:${o.customer?.name ?? "-"} | 伙伴:${o.partner?.name ?? "-"} | 阶段:${o.stage} | 金额:${o.amount ?? "-"} | 状态:${o.status}`;
  }
  return `- [id:${o.id}] ${o.name} | Customer:${o.customer?.name ?? "-"} | Partner:${o.partner?.name ?? "-"} | Stage:${o.stage} | Amount:${o.amount ?? "-"} | Status:${o.status}`;
}

function emptyText(query: AutomationQuery, locale: "zh" | "en"): string {
  if (query.source === "opportunities") {
    return locale === "zh" ? "✅ 当前无符合条件的商机" : "✅ No matching opportunities";
  }
  if (query.dueFilter === "within_days") {
    return locale === "zh"
      ? `✅ 未来 ${query.dueWithinDays ?? 3} 天内无到期待办`
      : `✅ No todos due within ${query.dueWithinDays ?? 3} days`;
  }
  if (query.dueFilter === "overdue") {
    return locale === "zh" ? "✅ 当前无逾期待办" : "✅ No overdue todos";
  }
  return locale === "zh" ? "✅ 当前无 OPEN 待办" : "✅ No open todos";
}

// ---------- delivery helpers ----------

async function pushWecomGroup(
  chatId: string,
  content: string,
  toolLog: ToolLogEntry[],
  pushNotes: string[],
  locale: "zh" | "en"
): Promise<void> {
  const chat = await getWecomChatByChatId(chatId);
  if (!chat) {
    const msg = `Chat ID "${chatId}" is not registered.`;
    toolLog.push({ tool: "push_wecom", args: { chatId }, result: msg });
    pushNotes.push(locale === "zh" ? "企微群推送失败（群未注册）" : "WeCom group push failed (chat not registered)");
    return;
  }
  const job = await enqueueWecomPush(chatId, content);
  toolLog.push({
    tool: "push_wecom",
    args: { chatId, contentLength: content.length },
    result: `WeCom push queued (job ${job.id})`,
  });
  pushNotes.push(locale === "zh" ? "已推送到企微群" : "Pushed to WeCom group");
}

async function pushEmail(
  to: string,
  subject: string,
  body: string,
  toolLog: ToolLogEntry[],
  pushNotes: string[],
  locale: "zh" | "en"
): Promise<void> {
  const ctx = { actions: [] as string[] };
  const result = await runSendEmailTool({ to, subject, body }, ctx);
  toolLog.push({ tool: "send_email", args: { to, subject }, result: result.slice(0, 500) });
  const ok = /Email sent/i.test(result);
  pushNotes.push(
    ok
      ? locale === "zh" ? "已发送邮件" : "Email sent"
      : locale === "zh" ? `邮件未发出：${result.slice(0, 120)}` : `Email failed: ${result.slice(0, 120)}`
  );
}

async function sendWecomApp(
  args: Record<string, unknown>,
  toolLog: ToolLogEntry[]
): Promise<string> {
  const ctx = { actions: [] as string[] };
  const result = await runSendWecomAppMessageTool(args, ctx);
  toolLog.push({ tool: "send_wecom_app", args, result: result.slice(0, 500) });
  return result;
}

/** 企微应用私信：推给我 / 按负责人 / 默认创建者 */
async function deliverWecomApp(
  agent: AgentForPipeline,
  query: AutomationQuery,
  todos: TodoRow[],
  cardTitle: string,
  fullBody: string,
  toolLog: ToolLogEntry[],
  pushNotes: string[],
  locale: "zh" | "en"
): Promise<void> {
  const perAssignee =
    query.source === "todos" && agent.pushWecomAppTo === PUSH_WECOM_APP_ASSIGNEES && todos.length > 0;

  if (perAssignee) {
    const byAssignee = new Map<string, TodoRow[]>();
    for (const t of todos) {
      const key = t.assignee?.name?.trim() || (locale === "zh" ? "未分配" : "Unassigned");
      const list = byAssignee.get(key) ?? [];
      list.push(t);
      byAssignee.set(key, list);
    }
    const results: string[] = [];
    for (const [name, items] of byAssignee) {
      const body = items.map((t) => formatTodoLine(t, locale)).join("\n");
      results.push(
        await sendWecomApp(
          {
            hubUserName: name,
            title: locale === "zh" ? `你有 ${items.length} 条待办` : `${items.length} todo(s)`,
            content: body,
            useTextcard: true,
            guideToBot: true,
          },
          toolLog
        )
      );
    }
    const ok = results.some((r) => /sent to/i.test(r));
    pushNotes.push(
      ok
        ? locale === "zh" ? `已按负责人发送企微应用消息（${byAssignee.size} 人）` : `WeCom app sent per assignee (${byAssignee.size})`
        : locale === "zh" ? `企微应用消息未发出：${results[0]?.slice(0, 80) ?? ""}` : `WeCom app failed: ${results[0]?.slice(0, 80) ?? ""}`
    );
    return;
  }

  if (!agent.createdById) {
    pushNotes.push(locale === "zh" ? "企微应用消息无收件人（自动化无创建者）" : "WeCom app skipped (no creator)");
    return;
  }
  const pushToSelf = mentionsPushToSelf(agent.description, agent.name);
  const r = await sendWecomApp(
    { hubUserId: agent.createdById, title: cardTitle, content: fullBody, useTextcard: true, guideToBot: true },
    toolLog
  );
  const ok = /sent to/i.test(r);
  pushNotes.push(
    ok
      ? locale === "zh" ? (pushToSelf ? "已推送到你的企微应用" : "已发送企微应用消息") : pushToSelf ? "Pushed to your WeCom app" : "WeCom app message sent"
      : locale === "zh" ? `企微应用消息未发出：${r.slice(0, 120)}` : `WeCom app failed: ${r.slice(0, 120)}`
  );
}

async function resolveQueryNames(query: AutomationQuery): Promise<{
  partnerName?: string;
  customerName?: string;
  assigneeName?: string;
}> {
  const [partner, customer, assignee] = await Promise.all([
    query.scope === "partner" && query.partnerId
      ? db.partner.findUnique({ where: { id: query.partnerId }, select: { name: true } })
      : null,
    query.scope === "customer" && query.customerId
      ? db.customer.findUnique({ where: { id: query.customerId }, select: { name: true } })
      : null,
    query.assigneeId
      ? db.user.findUnique({ where: { id: query.assigneeId }, select: { name: true } })
      : null,
  ]);
  return {
    partnerName: partner?.name,
    customerName: customer?.name,
    assigneeName: assignee?.name ?? undefined,
  };
}

/**
 * 确定性自动化管道：结构化 queryConfig → 直查 DB → 格式化 → 推送（零 LLM Token）。
 * 返回 null 表示需要回退 LLM 工具循环（source=ai 或无法确定化）。
 */
export async function runDeterministicQueryPipeline(
  agent: AgentForPipeline
): Promise<{ output: string; toolLog: ToolLogEntry[] } | null> {
  const query = resolveAutomationQuery(agent);
  if (!isDeterministicQuery(query)) return null;
  if (!hasAutomationDeliveryChannel(agent)) return null;

  const locale = pipelineLocale(agent);
  const names = await resolveQueryNames(query);

  const toolLog: ToolLogEntry[] = [];
  let listBody: string;
  let count: number;
  let todos: TodoRow[] = [];

  if (query.source === "todos") {
    todos = await queryTodos(query);
    count = todos.length;
    listBody = count ? todos.map((t) => formatTodoLine(t, locale)).join("\n") : emptyText(query, locale);
    toolLog.push({
      tool: "list_todos",
      args: {
        scope: query.scope,
        partnerId: query.partnerId,
        customerId: query.customerId,
        assigneeId: query.assigneeId,
        dueFilter: query.dueFilter,
        dueWithinDays: query.dueWithinDays,
      },
      result: count ? `${count} open todo(s)` : "No open todos",
    });
  } else {
    const rows = await queryOpportunities(query);
    count = rows.length;
    listBody = count ? rows.map((o) => formatOpportunityLine(o, locale)).join("\n") : emptyText(query, locale);
    toolLog.push({
      tool: "list_opportunities",
      args: { scope: query.scope, partnerId: query.partnerId, customerId: query.customerId, status: query.opportunityStatus },
      result: count ? `${count} opportunity(ies)` : "No opportunities",
    });
  }

  const heading = describeAutomationQuery(query, names, locale);
  const fullBody = `${heading}\n\n${listBody}`;
  const cardTitle =
    locale === "zh"
      ? count > 0
        ? `${heading}（${count} 条）`
        : heading
      : count > 0
        ? `${heading} (${count})`
        : heading;

  const pushNotes: string[] = [];
  if (agent.wecomPushChatId?.trim()) {
    await pushWecomGroup(agent.wecomPushChatId.trim(), fullBody, toolLog, pushNotes, locale);
  }
  if (agent.pushEmailTo?.trim()) {
    await pushEmail(agent.pushEmailTo.trim(), heading, fullBody, toolLog, pushNotes, locale);
  }
  if (isWecomAppPushEnabled(agent.pushWecomAppTo)) {
    await deliverWecomApp(agent, query, todos, cardTitle, fullBody, toolLog, pushNotes, locale);
  }

  const intro =
    count > 0
      ? locale === "zh"
        ? `共 **${count} 条**，明细如下：`
        : `**${count}** item(s):`
      : "";
  const pushLine =
    pushNotes.length > 0
      ? locale === "zh"
        ? `\n\n**推送结果：** ${pushNotes.join("；")}`
        : `\n\n**Delivery:** ${pushNotes.join("; ")}`
      : locale === "zh"
        ? "\n\n**推送结果：** 未配置推送渠道"
        : "\n\n**Delivery:** no channel configured";

  const output = `### ${heading}\n\n${intro ? `${intro}\n\n` : ""}${listBody}${pushLine}`;
  return { output, toolLog };
}
