import "server-only";

import type { Agent } from "@prisma/client";
import { db } from "./db";
import { chatCompletion, type ChatMessage } from "./ai";
import { runSendEmailTool } from "./skill-actions/send-email";
import { END_CUSTOMER_WHERE } from "./customer-filters";
import { resolveAgentTimezone } from "./cron";
import {
  computeWorkWeekWindow,
  parseWeeklyReportConfig,
  resolveManagerEmails,
  resolveTargetUsers,
  type WeekWindow,
} from "./weekly-report-config";

// ============ 单人聚合 ============

export type WeeklyUserStats = {
  userId: string;
  name: string;
  email: string | null;
  doneTodos: { title: string; doneAt: Date | null; owner: string }[];
  businessRecords: { title: string; category: string; occurredAt: Date; owner: string }[];
  newCustomers: { name: string; status: string }[];
  upcomingTodos: { title: string; dueDate: Date | null; overdue: boolean; owner: string }[];
  activeOpportunities: { name: string; stage: string; amount: string | null; owner: string }[];
};

function ownerLabel(row: { partner?: { name: string } | null; customer?: { name: string } | null }): string {
  return row.customer?.name ?? row.partner?.name ?? "-";
}

export function statsActivityCount(s: WeeklyUserStats): number {
  return s.doneTodos.length + s.businessRecords.length + s.newCustomers.length;
}

export async function gatherUserWeekly(
  user: { id: string; name: string; email: string | null },
  window: WeekWindow
): Promise<WeeklyUserStats> {
  const inWindow = { gte: window.start, lte: window.end };
  const next7 = new Date(window.end.getTime() + 7 * 24 * 3600 * 1000);

  const [doneTodos, businessRecords, newCustomers, upcomingTodos, activeOpps] = await Promise.all([
    db.todoItem.findMany({
      where: { assigneeId: user.id, status: "DONE", doneAt: inWindow },
      include: { partner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { doneAt: "desc" },
      take: 100,
    }),
    db.businessRecord.findMany({
      where: { createdById: user.id, occurredAt: inWindow },
      include: { partner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    db.customer.findMany({
      where: {
        ...END_CUSTOMER_WHERE,
        createdAt: inWindow,
        OR: [{ createdById: user.id }, { ownerId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.todoItem.findMany({
      where: {
        assigneeId: user.id,
        status: "OPEN",
        OR: [{ dueDate: { lte: next7 } }, { dueDate: null }],
      },
      include: { partner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
    db.opportunity.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ customer: { ownerId: user.id } }, { partner: { ownerId: user.id } }],
      },
      include: { partner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const now = window.end;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    doneTodos: doneTodos.map((t) => ({ title: t.title, doneAt: t.doneAt, owner: ownerLabel(t) })),
    businessRecords: businessRecords.map((r) => ({
      title: r.title,
      category: r.category,
      occurredAt: r.occurredAt,
      owner: ownerLabel(r),
    })),
    newCustomers: newCustomers.map((c) => ({ name: c.name, status: c.status })),
    upcomingTodos: upcomingTodos.map((t) => ({
      title: t.title,
      dueDate: t.dueDate,
      overdue: !!t.dueDate && t.dueDate < now,
      owner: ownerLabel(t),
    })),
    activeOpportunities: activeOpps.map((o) => ({
      name: o.name,
      stage: o.stage,
      amount: o.amount,
      owner: ownerLabel(o),
    })),
  };
}

// ============ 渲染（确定性数据块，供 LLM 输入 + 邮件展示） ============

function ymd(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "-";
}

/** 给 LLM 看的纯文本数据块（数字与明细都是确定的，AI 只负责写小结/建议） */
export function renderStatsForPrompt(s: WeeklyUserStats, window: WeekWindow): string {
  const lines: string[] = [];
  lines.push(`# ${s.name} 本周数据（${window.label}）`);
  lines.push("");
  lines.push(`## 已完成待办（${s.doneTodos.length}）`);
  lines.push(
    s.doneTodos.length
      ? s.doneTodos.map((t) => `- ${t.title}（${t.owner}，完成于 ${ymd(t.doneAt)}）`).join("\n")
      : "- 无"
  );
  lines.push("");
  lines.push(`## 商务记录（${s.businessRecords.length}）`);
  lines.push(
    s.businessRecords.length
      ? s.businessRecords.map((r) => `- [${r.category}] ${r.title}（${r.owner}，${ymd(r.occurredAt)}）`).join("\n")
      : "- 无"
  );
  lines.push("");
  lines.push(`## 新增客户（${s.newCustomers.length}）`);
  lines.push(
    s.newCustomers.length ? s.newCustomers.map((c) => `- ${c.name}（${c.status}）`).join("\n") : "- 无"
  );
  lines.push("");
  lines.push(`## 下周待办（OPEN，未来 7 天到期或无期限，含逾期）（${s.upcomingTodos.length}）`);
  lines.push(
    s.upcomingTodos.length
      ? s.upcomingTodos
          .map((t) => `- ${t.title}（${t.owner}，截止 ${ymd(t.dueDate)}${t.overdue ? "，已逾期" : ""}）`)
          .join("\n")
      : "- 无"
  );
  lines.push("");
  lines.push(`## 活跃商机（${s.activeOpportunities.length}）`);
  lines.push(
    s.activeOpportunities.length
      ? s.activeOpportunities
          .map((o) => `- ${o.name}（${o.owner}，阶段 ${o.stage}，金额 ${o.amount ?? "-"}）`)
          .join("\n")
      : "- 无"
  );
  return lines.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function listHtml(items: string[]): string {
  if (!items.length) return `<p style="color:#888;margin:4px 0">无</p>`;
  return `<ul style="margin:4px 0 12px;padding-left:20px">${items
    .map((i) => `<li style="margin:2px 0">${esc(i)}</li>`)
    .join("")}</ul>`;
}

/** 单人周报 HTML（AI 叙述 + 确定性明细） */
export function renderUserEmailHtml(s: WeeklyUserStats, window: WeekWindow, narrative: string): string {
  const narrativeHtml = narrative
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:8px 0;line-height:1.7">${esc(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937">
  <h2 style="margin:0 0 4px">📊 ${esc(s.name)} 的本周工作周报</h2>
  <p style="color:#6b7280;margin:0 0 16px">统计周期：${esc(window.label)}（利雅得时间）</p>
  <div style="display:flex;gap:12px;margin:0 0 20px;flex-wrap:wrap">
    ${statCard("完成待办", s.doneTodos.length)}
    ${statCard("商务记录", s.businessRecords.length)}
    ${statCard("新增客户", s.newCustomers.length)}
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin:0 0 20px">
    <h3 style="margin:0 0 6px;color:#111827">本周小结与下周计划（AI 生成）</h3>
    ${narrativeHtml || '<p style="color:#888">（暂无内容）</p>'}
  </div>
  <h3 style="margin:16px 0 4px">✅ 已完成待办（${s.doneTodos.length}）</h3>
  ${listHtml(s.doneTodos.map((t) => `${t.title}（${t.owner}，${ymd(t.doneAt)}）`))}
  <h3 style="margin:16px 0 4px">🤝 商务记录（${s.businessRecords.length}）</h3>
  ${listHtml(s.businessRecords.map((r) => `[${r.category}] ${r.title}（${r.owner}，${ymd(r.occurredAt)}）`))}
  <h3 style="margin:16px 0 4px">🆕 新增客户（${s.newCustomers.length}）</h3>
  ${listHtml(s.newCustomers.map((c) => `${c.name}（${c.status}）`))}
  <h3 style="margin:16px 0 4px">📅 下周待办（${s.upcomingTodos.length}）</h3>
  ${listHtml(
    s.upcomingTodos.map((t) => `${t.title}（${t.owner}，截止 ${ymd(t.dueDate)}${t.overdue ? "，已逾期" : ""}）`)
  )}
  <h3 style="margin:16px 0 4px">💼 活跃商机（${s.activeOpportunities.length}）</h3>
  ${listHtml(
    s.activeOpportunities.map((o) => `${o.name}（${o.owner}，阶段 ${o.stage}，金额 ${o.amount ?? "-"}）`)
  )}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
    本邮件由 Partner Hub 周报自动化生成。数据来自系统记录，建议部分由 AI 生成，仅供参考。
  </p>
</div>`;
}

function statCard(label: string, value: number): string {
  return `<div style="flex:1;min-width:120px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;text-align:center">
    <div style="font-size:28px;font-weight:700;color:#1d4ed8">${value}</div>
    <div style="font-size:13px;color:#3b82f6">${esc(label)}</div>
  </div>`;
}

/** 单人周报纯文本兜底 */
export function renderUserEmailText(s: WeeklyUserStats, window: WeekWindow, narrative: string): string {
  return `${s.name} 的本周工作周报\n统计周期：${window.label}（利雅得时间）\n\n完成待办 ${s.doneTodos.length} | 商务记录 ${s.businessRecords.length} | 新增客户 ${s.newCustomers.length}\n\n【本周小结与下周计划】\n${narrative}\n\n---\n${renderStatsForPrompt(s, window)}`;
}

// ============ 管理者汇总 ============

export function renderManagerDigestHtml(all: WeeklyUserStats[], window: WeekWindow): string {
  const rows = all
    .map((s) => {
      const active = statsActivityCount(s) > 0;
      return `<tr style="${active ? "" : "color:#9ca3af;background:#fafafa"}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(s.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.doneTodos.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.businessRecords.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.newCustomers.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.upcomingTodos.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.activeOpportunities.length}</td>
      </tr>`;
    })
    .join("");
  const totals = all.reduce(
    (acc, s) => {
      acc.done += s.doneTodos.length;
      acc.br += s.businessRecords.length;
      acc.cust += s.newCustomers.length;
      return acc;
    },
    { done: 0, br: 0, cust: 0 }
  );
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1f2937">
  <h2 style="margin:0 0 4px">📈 团队周报汇总</h2>
  <p style="color:#6b7280;margin:0 0 16px">统计周期：${esc(window.label)}（利雅得时间） · 共 ${all.length} 人</p>
  <p style="margin:0 0 12px">本周合计：完成待办 <b>${totals.done}</b> · 商务记录 <b>${totals.br}</b> · 新增客户 <b>${totals.cust}</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="background:#1d4ed8;color:#fff">
        <th style="padding:8px 10px;text-align:left">成员</th>
        <th style="padding:8px 10px">完成待办</th>
        <th style="padding:8px 10px">商务记录</th>
        <th style="padding:8px 10px">新增客户</th>
        <th style="padding:8px 10px">下周待办</th>
        <th style="padding:8px 10px">活跃商机</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
    本邮件由 Partner Hub 周报自动化生成。灰色行表示本周无统计活动。
  </p>
</div>`;
}

// ============ AI 叙述 ============

async function generateNarrative(
  s: WeeklyUserStats,
  window: WeekWindow,
  userId: string | null
): Promise<string> {
  const dataBlock = renderStatsForPrompt(s, window);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是中东 BI 伙伴管理团队的周报助手。根据给定的本周工作数据，用简体中文撰写周报正文。" +
        "严格分两部分：\n" +
        "【本周小结】用一段话提炼本周亮点与进展（结合完成待办、商务记录、新增客户）。\n" +
        "【下周计划与建议】基于「下周待办」和「活跃商机」给出 3-5 条具体、可执行的建议，按优先级排列。\n" +
        "要求：语气专业、简洁、积极；只依据给定数据，绝不编造数字或客户；如某类数据为空可如实指出。不要重复罗列全部明细（明细邮件里已有），重在洞察与建议。",
    },
    {
      role: "user",
      content: `${dataBlock}\n\n请按上述要求输出周报正文（两部分），不要加额外标题层级，不要使用 Markdown 代码块。`,
    },
  ];
  try {
    const res = await chatCompletion(messages, {
      feature: "Weekly report narrative",
      userId: userId ?? undefined,
      temperature: 0.5,
      maxTokens: 900,
      taskTier: "fast",
    });
    const text = (res.content ?? "").trim();
    if (text) return text;
  } catch (e) {
    console.warn(`[weekly-report] narrative LLM failed for ${s.name}:`, e instanceof Error ? e.message : e);
  }
  // 兜底：无 AI 时给确定性提示
  const next =
    s.upcomingTodos.length || s.activeOpportunities.length
      ? "下周计划：请关注上述「下周待办」与「活跃商机」，优先推进逾期项与高阶段商机。"
      : "下周计划：本周暂无待办与活跃商机，建议主动开拓新客户与商机。";
  return `本周小结：完成待办 ${s.doneTodos.length} 项，商务记录 ${s.businessRecords.length} 条，新增客户 ${s.newCustomers.length} 个。\n\n${next}`;
}

// ============ 管道入口 ============

export type WeeklyPipelineResult = {
  output: string;
  toolLog: { tool: string; args: unknown; result: string }[];
  runStatus: "SUCCESS" | "PARTIAL_SUCCESS";
};

export async function runWeeklyReportPipeline(
  agent: Pick<Agent, "queryConfig" | "timezone" | "createdById" | "name">
): Promise<WeeklyPipelineResult> {
  const config = parseWeeklyReportConfig(agent.queryConfig);
  if (!config) {
    return {
      output: "周报配置无效（queryConfig 缺少 source=weekly_review）。",
      toolLog: [],
      runStatus: "PARTIAL_SUCCESS",
    };
  }

  const tz = resolveAgentTimezone(agent.timezone);
  const window = computeWorkWeekWindow(new Date(), tz);
  const toolLog: WeeklyPipelineResult["toolLog"] = [];
  const pushNotes: string[] = [];

  const users = await resolveTargetUsers(config.roles);
  toolLog.push({
    tool: "resolve_users",
    args: { roles: config.roles },
    result: `${users.length} user(s): ${users.map((u) => u.name).join(", ") || "none"}`,
  });

  // 逐人聚合
  const allStats: WeeklyUserStats[] = [];
  for (const u of users) {
    allStats.push(await gatherUserWeekly(u, window));
  }

  // 逐人发个人周报
  let sentPersonal = 0;
  let skippedNoEmail = 0;
  let skippedInactive = 0;
  for (const s of allStats) {
    const active = statsActivityCount(s) > 0;
    if (!active && !config.includeInactive) {
      skippedInactive++;
      continue;
    }
    if (!s.email) {
      skippedNoEmail++;
      toolLog.push({ tool: "send_email", args: { user: s.name }, result: "skipped: no email" });
      continue;
    }
    const narrative = await generateNarrative(s, window, agent.createdById);
    const html = renderUserEmailHtml(s, window, narrative);
    const text = renderUserEmailText(s, window, narrative);
    const subject = `📊 你的本周工作周报（${window.label}）`;
    const ctx = { actions: [] as string[] };
    const result = await runSendEmailTool({ to: s.email, subject, body: text, html }, ctx);
    const ok = /Email sent/i.test(result);
    if (ok) sentPersonal++;
    toolLog.push({ tool: "send_email", args: { to: s.email, subject }, result: result.slice(0, 200) });
  }
  pushNotes.push(`个人周报已发 ${sentPersonal} 人`);
  if (skippedInactive) pushNotes.push(`跳过无活动 ${skippedInactive} 人`);
  if (skippedNoEmail) pushNotes.push(`无邮箱跳过 ${skippedNoEmail} 人`);

  // 管理者汇总
  let managerOk = false;
  const { emails: managerEmails, resolved: managerResolved } = await resolveManagerEmails(config.managers);
  const unresolved = managerResolved.filter((r) => !r.email).map((r) => r.token);
  if (managerEmails.length) {
    const html = renderManagerDigestHtml(allStats, window);
    const text = allStats
      .map(
        (s) =>
          `${s.name}: 完成待办 ${s.doneTodos.length} | 商务记录 ${s.businessRecords.length} | 新增客户 ${s.newCustomers.length} | 下周待办 ${s.upcomingTodos.length} | 活跃商机 ${s.activeOpportunities.length}`
      )
      .join("\n");
    const subject = `📈 团队周报汇总（${window.label}）`;
    const ctx = { actions: [] as string[] };
    const result = await runSendEmailTool(
      { to: managerEmails.join(","), subject, body: `团队周报汇总（${window.label}）\n\n${text}`, html },
      ctx
    );
    managerOk = /Email sent/i.test(result);
    toolLog.push({ tool: "send_email", args: { to: managerEmails, subject }, result: result.slice(0, 200) });
    pushNotes.push(managerOk ? `管理者汇总已发（${managerEmails.length} 人）` : `管理者汇总发送失败`);
  } else {
    pushNotes.push("管理者汇总未发（未解析到收件人）");
  }
  if (unresolved.length) pushNotes.push(`未识别管理者：${unresolved.join("、")}`);

  // 运行结果
  const allOk =
    (sentPersonal > 0 || skippedInactive === allStats.length || allStats.length === 0) &&
    (managerEmails.length === 0 || managerOk) &&
    unresolved.length === 0 &&
    skippedNoEmail === 0;
  const runStatus: "SUCCESS" | "PARTIAL_SUCCESS" = allOk ? "SUCCESS" : "PARTIAL_SUCCESS";

  const summaryLines = allStats.map(
    (s) =>
      `- ${s.name}：完成待办 ${s.doneTodos.length} · 商务记录 ${s.businessRecords.length} · 新增客户 ${s.newCustomers.length}`
  );
  const output = `### 团队周报（${window.label}）

覆盖 **${allStats.length}** 人（角色：${config.roles.join("/")}）

${summaryLines.join("\n") || "（无目标用户）"}

**推送结果：** ${pushNotes.join("；")}`;

  return { output, toolLog, runStatus };
}

// ============ 试发给某一个人 ============

/**
 * 立即给单个用户生成并发送其本周周报。
 * - userId：目标用户（统计其本周数据）
 * - toEmailOverride：可选，覆盖收件邮箱（默认发到该用户自己的邮箱）
 */
export async function sendSingleUserReport(opts: {
  userId: string;
  toEmailOverride?: string;
  timezone?: string;
  creatorId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const user = await db.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) return { ok: false, message: "未找到该用户" };

  const to = (opts.toEmailOverride?.trim() || user.email || "").trim();
  if (!to) return { ok: false, message: `${user.name} 没有邮箱，且未指定收件邮箱` };

  const tz = resolveAgentTimezone(opts.timezone);
  const window = computeWorkWeekWindow(new Date(), tz);
  const stats = await gatherUserWeekly(user, window);
  const narrative = await generateNarrative(stats, window, opts.creatorId ?? null);
  const html = renderUserEmailHtml(stats, window, narrative);
  const text = renderUserEmailText(stats, window, narrative);
  const subject = `📊【试发】${user.name} 的本周工作周报（${window.label}）`;

  const ctx = { actions: [] as string[] };
  const result = await runSendEmailTool({ to, subject, body: text, html }, ctx);
  const ok = /Email sent/i.test(result);
  return {
    ok,
    message: ok
      ? `已试发 ${user.name} 的周报至 ${to}（完成待办 ${stats.doneTodos.length}·商务记录 ${stats.businessRecords.length}·新增客户 ${stats.newCustomers.length}）`
      : `试发失败：${result.slice(0, 160)}`,
  };
}
