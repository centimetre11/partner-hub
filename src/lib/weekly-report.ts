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
  resolveManagerUsers,
  resolveTargetUsers,
  mergeWeeklyReportUsers,
  type WeekWindow,
} from "./weekly-report-config";
import {
  buildWeeklyReportLocaleMap,
  getWeeklyReportCopy,
  normalizeWeeklyReportLocale,
  resolveWeeklyReportLocale,
  type WeeklyReportCopy,
  type WeeklyReportLocale,
} from "./weekly-report-locale";
import { formatProcessTagsDisplay } from "./opportunity-process-tags";
import { OPEN_OPPORTUNITY_STATUSES } from "./opportunity-status";

// ============ 单人聚合 ============

export type WeeklyUserStats = {
  userId: string;
  name: string;
  email: string | null;
  doneTodos: { title: string; doneAt: Date | null; owner: string; link: string }[];
  businessRecords: { title: string; category: string; occurredAt: Date; owner: string }[];
  workLogs: { projectName: string; customerName: string; content: string; createdAt: Date }[];
  faqEntries: { question: string; category: string; action: "created" | "updated"; verified: boolean; answerPreview: string; at: Date }[];
  newCustomers: { name: string; status: string }[];
  upcomingTodos: { title: string; dueDate: Date | null; overdue: boolean; owner: string; link: string }[];
  activeOpportunities: { name: string; stage: string; amount: string | null; owner: string; dealType: string | null }[];
  activeProjects: { name: string; phase: string; status: string; owner: string; done: number; total: number }[];
};

function ownerLabel(row: { partner?: { name: string } | null; customer?: { name: string } | null }): string {
  return row.customer?.name ?? row.partner?.name ?? "-";
}

/** 待办的机会/项目归属文本（项目优先） */
function todoLinkText(
  row: { project?: { name: string } | null; opportunity?: { name: string } | null },
  copy: WeeklyReportCopy
): string {
  if (row.project) return `${copy.projectPrefix}: ${row.project.name}`;
  if (row.opportunity) return `${copy.opportunityPrefix}: ${row.opportunity.name}`;
  return "";
}

function dealTypeText(dealType: string | null, copy: WeeklyReportCopy): string {
  if (dealType === "PROJECT") return copy.dealTypeProject;
  if (dealType === "PRODUCT") return copy.dealTypeProduct;
  return "";
}

export function statsActivityCount(s: WeeklyUserStats): number {
  return s.doneTodos.length + s.businessRecords.length + s.workLogs.length + s.faqEntries.length + s.newCustomers.length;
}

function faqCategoryLabel(category: string, copy: WeeklyReportCopy): string {
  return copy.faqCategories[category] ?? category;
}

function faqEntryText(f: WeeklyUserStats["faqEntries"][number], copy: WeeklyReportCopy): string {
  const actionLabel = f.action === "created" ? copy.faqCreated : copy.faqUpdated;
  const official = f.verified ? copy.faqVerified : "";
  const cat = faqCategoryLabel(f.category, copy);
  if (copy.locale === "en") {
    const preview = f.answerPreview ? `: ${f.answerPreview}` : "";
    return `[${cat}] ${f.question} (${actionLabel}, ${ymd(f.at)}${official})${preview}`;
  }
  const preview = f.answerPreview ? `：${f.answerPreview}` : "";
  return `[${cat}] ${f.question}（${actionLabel}，${ymd(f.at)}${official}）${preview}`;
}

function faqAnswerPreview(answer: string, max = 80): string {
  const flat = answer.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function classifyFaqEntry(
  entry: { id: string; createdById: string | null; createdAt: Date; lastEditorName: string | null; updatedAt: Date },
  user: { id: string; name: string },
  window: WeekWindow
): "created" | "updated" | null {
  const createdInWindow =
    entry.createdById === user.id && entry.createdAt >= window.start && entry.createdAt <= window.end;
  if (createdInWindow) return "created";
  const updatedInWindow =
    entry.lastEditorName === user.name && entry.updatedAt >= window.start && entry.updatedAt <= window.end;
  if (updatedInWindow) return "updated";
  return null;
}

export async function gatherUserWeekly(
  user: { id: string; name: string; email: string | null },
  window: WeekWindow,
  locale: WeeklyReportLocale = "zh"
): Promise<WeeklyUserStats> {
  const copy = getWeeklyReportCopy(locale);
  const inWindow = { gte: window.start, lte: window.end };
  const next7 = new Date(window.end.getTime() + 7 * 24 * 3600 * 1000);

  const [doneTodos, businessRecords, workLogs, faqRaw, newCustomers, upcomingTodos, activeOpps, activeProjects] = await Promise.all([
    db.todoItem.findMany({
      where: { assigneeId: user.id, status: "DONE", doneAt: inWindow },
      include: {
        partner: { select: { name: true } },
        customer: { select: { name: true } },
        opportunity: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { doneAt: "desc" },
      take: 100,
    }),
    db.businessRecord.findMany({
      where: { createdById: user.id, occurredAt: inWindow },
      include: { partner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    db.projectWorkLog.findMany({
      where: { authorId: user.id, createdAt: inWindow },
      include: {
        project: {
          select: {
            name: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.faqEntry.findMany({
      where: {
        OR: [
          { createdById: user.id, createdAt: inWindow },
          { lastEditorName: user.name, updatedAt: inWindow },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
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
      include: {
        partner: { select: { name: true } },
        customer: { select: { name: true } },
        opportunity: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
    db.opportunity.findMany({
      where: {
        status: { in: [...OPEN_OPPORTUNITY_STATUSES] },
        OR: [{ customer: { ownerId: user.id } }, { partner: { ownerId: user.id } }],
      },
      include: { partner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    db.project.findMany({
      where: {
        status: { in: ["ACTIVE", "ON_HOLD"] },
        OR: [{ ownerId: user.id }, { customer: { ownerId: user.id } }],
      },
      include: { customer: { select: { name: true } }, partner: { select: { name: true } }, todos: { select: { status: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const now = window.end;
  const faqEntries = faqRaw
    .map((f) => {
      const action = classifyFaqEntry(f, user, window);
      if (!action) return null;
      return {
        question: f.question,
        category: f.category,
        action,
        verified: f.verified,
        answerPreview: faqAnswerPreview(f.answer),
        at: action === "created" ? f.createdAt : f.updatedAt,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    doneTodos: doneTodos.map((t) => ({ title: t.title, doneAt: t.doneAt, owner: ownerLabel(t), link: todoLinkText(t, copy) })),
    businessRecords: businessRecords.map((r) => ({
      title: r.title,
      category: r.category,
      occurredAt: r.occurredAt,
      owner: ownerLabel(r),
    })),
    workLogs: workLogs.map((w) => ({
      projectName: w.project.name,
      customerName: w.project.customer.name,
      content: w.content,
      createdAt: w.createdAt,
    })),
    faqEntries,
    newCustomers: newCustomers.map((c) => ({ name: c.name, status: c.status })),
    upcomingTodos: upcomingTodos.map((t) => ({
      title: t.title,
      dueDate: t.dueDate,
      overdue: !!t.dueDate && t.dueDate < now,
      owner: ownerLabel(t),
      link: todoLinkText(t, copy),
    })),
    activeOpportunities: activeOpps.map((o) => ({
      name: o.name,
      stage: formatProcessTagsDisplay(o.stage, copy.locale),
      amount: o.amount,
      owner: ownerLabel(o),
      dealType: o.dealType,
    })),
    activeProjects: activeProjects.map((p) => ({
      name: p.name,
      phase: p.phase,
      status: p.status,
      owner: ownerLabel(p),
      done: p.todos.filter((t) => t.status === "DONE").length,
      total: p.todos.length,
    })),
  };
}

// ============ 渲染（确定性数据块，供 LLM 输入 + 邮件展示） ============

function ymd(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "-";
}

/** 给 LLM 看的纯文本数据块（数字与明细都是确定的，AI 只负责写小结/建议） */
export function renderStatsForPrompt(s: WeeklyUserStats, window: WeekWindow, copy: WeeklyReportCopy): string {
  const lines: string[] = [];
  const doneSuffix = copy.locale === "en" ? ", done " : "，完成于 ";
  const dueSuffix = copy.locale === "en" ? ", due " : "，截止 ";
  const stageLabel = copy.locale === "en" ? "process " : "过程 ";
  const amountLabel = copy.locale === "en" ? "amount " : "金额 ";
  const statusLabel = copy.locale === "en" ? "status " : "状态 ";
  const todosLabel = copy.locale === "en" ? "todos " : "待办 ";

  lines.push(copy.promptStatsHeader(s.name, window.label));
  lines.push("");
  lines.push(`## ${copy.sections.doneTodos}（${s.doneTodos.length}）`);
  lines.push(
    s.doneTodos.length
      ? s.doneTodos
          .map((t) => `- ${t.title}（${t.owner}${t.link ? `，${t.link}` : ""}${doneSuffix}${ymd(t.doneAt)}）`)
          .join("\n")
      : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.businessRecords}（${s.businessRecords.length}）`);
  lines.push(
    s.businessRecords.length
      ? s.businessRecords.map((r) => `- [${r.category}] ${r.title}（${r.owner}，${ymd(r.occurredAt)}）`).join("\n")
      : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.workLogs}（${s.workLogs.length}）`);
  lines.push(
    s.workLogs.length
      ? s.workLogs.map((w) => `- ${w.projectName}（${w.customerName}，${ymd(w.createdAt)}）：${w.content}`).join("\n")
      : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.faqEntries}（${s.faqEntries.length}）`);
  lines.push(
    s.faqEntries.length ? s.faqEntries.map((f) => `- ${faqEntryText(f, copy)}`).join("\n") : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.newCustomers}（${s.newCustomers.length}）`);
  lines.push(
    s.newCustomers.length ? s.newCustomers.map((c) => `- ${c.name}（${c.status}）`).join("\n") : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.upcomingTodos}（${s.upcomingTodos.length}）`);
  lines.push(
    s.upcomingTodos.length
      ? s.upcomingTodos
          .map(
            (t) =>
              `- ${t.title}（${t.owner}${t.link ? `，${t.link}` : ""}${dueSuffix}${ymd(t.dueDate)}${t.overdue ? copy.overdue : ""}）`
          )
          .join("\n")
      : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.activeOpportunities}（${s.activeOpportunities.length}）`);
  lines.push(
    s.activeOpportunities.length
      ? s.activeOpportunities
          .map(
            (o) =>
              `- ${o.name}（${o.owner}，${stageLabel}${o.stage}，${amountLabel}${o.amount ?? "-"}${dealTypeText(o.dealType, copy) ? `，${dealTypeText(o.dealType, copy)}` : ""}）`
          )
          .join("\n")
      : `- ${copy.none}`
  );
  lines.push("");
  lines.push(`## ${copy.sections.activeProjects}（${s.activeProjects.length}）`);
  lines.push(
    s.activeProjects.length
      ? s.activeProjects
          .map(
            (p) =>
              `- ${p.name}（${p.owner}，${stageLabel}${p.phase}，${statusLabel}${p.status}，${todosLabel}${p.done}/${p.total}）`
          )
          .join("\n")
      : `- ${copy.none}`
  );
  return lines.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function listHtml(items: string[], noneLabel: string): string {
  if (!items.length) return `<p style="color:#888;margin:4px 0">${esc(noneLabel)}</p>`;
  return `<ul style="margin:4px 0 12px;padding-left:20px">${items
    .map((i) => `<li style="margin:2px 0">${esc(i)}</li>`)
    .join("")}</ul>`;
}

/** 单人周报 HTML（AI 叙述 + 确定性明细） */
export function renderUserEmailHtml(
  s: WeeklyUserStats,
  window: WeekWindow,
  narrative: string,
  copy: WeeklyReportCopy
): string {
  const narrativeHtml = narrative
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:8px 0;line-height:1.7">${esc(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const overdue = copy.overdue;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937">
  <h2 style="margin:0 0 4px">${esc(copy.email.personalTitle(s.name))}</h2>
  <p style="color:#6b7280;margin:0 0 16px">${esc(copy.email.period(window.label))}</p>
  <div style="display:flex;gap:12px;margin:0 0 20px;flex-wrap:wrap">
    ${statCard(copy.statCards.doneTodos, s.doneTodos.length)}
    ${statCard(copy.statCards.businessRecords, s.businessRecords.length)}
    ${statCard(copy.statCards.workLogs, s.workLogs.length)}
    ${statCard(copy.statCards.faqEntries, s.faqEntries.length)}
    ${statCard(copy.statCards.newCustomers, s.newCustomers.length)}
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin:0 0 20px">
    <h3 style="margin:0 0 6px;color:#111827">${esc(copy.sections.aiNarrative)}</h3>
    ${narrativeHtml || `<p style="color:#888">${esc(copy.email.noNarrative)}</p>`}
  </div>
  <h3 style="margin:16px 0 4px">✅ ${esc(copy.sections.doneTodos)}（${s.doneTodos.length}）</h3>
  ${listHtml(s.doneTodos.map((t) => `${t.title}（${t.owner}${t.link ? `，${t.link}` : ""}，${ymd(t.doneAt)}）`), copy.none)}
  <h3 style="margin:16px 0 4px">🤝 ${esc(copy.sections.businessRecords)}（${s.businessRecords.length}）</h3>
  ${listHtml(s.businessRecords.map((r) => `[${r.category}] ${r.title}（${r.owner}，${ymd(r.occurredAt)}）`), copy.none)}
  <h3 style="margin:16px 0 4px">📝 ${esc(copy.sections.workLogs)}（${s.workLogs.length}）</h3>
  ${listHtml(s.workLogs.map((w) => `${w.projectName}（${w.customerName}，${ymd(w.createdAt)}）：${w.content}`), copy.none)}
  <h3 style="margin:16px 0 4px">💬 ${esc(copy.sections.faqEntries)}（${s.faqEntries.length}）</h3>
  ${listHtml(s.faqEntries.map((f) => faqEntryText(f, copy)), copy.none)}
  <h3 style="margin:16px 0 4px">🆕 ${esc(copy.sections.newCustomers)}（${s.newCustomers.length}）</h3>
  ${listHtml(s.newCustomers.map((c) => `${c.name}（${c.status}）`), copy.none)}
  <h3 style="margin:16px 0 4px">📅 ${esc(copy.sections.upcomingTodos)}（${s.upcomingTodos.length}）</h3>
  ${listHtml(
    s.upcomingTodos.map((t) => `${t.title}（${t.owner}${t.link ? `，${t.link}` : ""}，${ymd(t.dueDate)}${t.overdue ? overdue : ""}）`),
    copy.none
  )}
  <h3 style="margin:16px 0 4px">💼 ${esc(copy.sections.activeOpportunities)}（${s.activeOpportunities.length}）</h3>
  ${listHtml(
    s.activeOpportunities.map(
      (o) =>
        `${o.name}（${o.owner}，${copy.locale === "en" ? "process " : "过程 "}${o.stage}，${copy.locale === "en" ? "amount " : "金额 "}${o.amount ?? "-"}${dealTypeText(o.dealType, copy) ? `，${dealTypeText(o.dealType, copy)}` : ""}）`
    ),
    copy.none
  )}
  <h3 style="margin:16px 0 4px">📦 ${esc(copy.sections.activeProjects)}（${s.activeProjects.length}）</h3>
  ${listHtml(
    s.activeProjects.map(
      (p) =>
        `${p.name}（${p.owner}，${copy.locale === "en" ? "phase " : "阶段 "}${p.phase}，${copy.locale === "en" ? "status " : "状态 "}${p.status}，${copy.locale === "en" ? "todos " : "待办 "}${p.done}/${p.total}）`
    ),
    copy.none
  )}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
    ${esc(copy.email.footer)}
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
export function renderUserEmailText(
  s: WeeklyUserStats,
  window: WeekWindow,
  narrative: string,
  copy: WeeklyReportCopy
): string {
  const summary =
    copy.locale === "en"
      ? `To-dos ${s.doneTodos.length} | Business ${s.businessRecords.length} | Work logs ${s.workLogs.length} | Q&A ${s.faqEntries.length} | Customers ${s.newCustomers.length}`
      : `完成待办 ${s.doneTodos.length} | 商务记录 ${s.businessRecords.length} | 项目工作记录 ${s.workLogs.length} | 问答库 ${s.faqEntries.length} | 新增客户 ${s.newCustomers.length}`;
  const narrativeTitle = copy.locale === "en" ? "Weekly summary & next week" : "本周小结与下周计划";
  return `${copy.email.personalTitle(s.name)}\n${copy.email.period(window.label)}\n\n${summary}\n\n【${narrativeTitle}】\n${narrative}\n\n---\n${renderStatsForPrompt(s, window, copy)}`;
}

// ============ 管理者汇总 ============

export type WeeklyUserReport = { stats: WeeklyUserStats; narrative: string; locale: WeeklyReportLocale };

function narrativeExcerptHtml(narrative: string, emptyLabel: string): string {
  const trimmed = narrative.trim();
  if (!trimmed) return `<p style="color:#888;margin:0">${esc(emptyLabel)}</p>`;
  return trimmed
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:4px 0;line-height:1.6;font-size:13px">${esc(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function renderManagerDigestHtml(
  reports: WeeklyUserReport[],
  window: WeekWindow,
  copy: WeeklyReportCopy
): string {
  const all = reports.map((r) => r.stats);
  const rows = all
    .map((s) => {
      const active = statsActivityCount(s) > 0;
      return `<tr style="${active ? "" : "color:#9ca3af;background:#fafafa"}">
        <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(s.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.doneTodos.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.businessRecords.length}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${s.faqEntries.length}</td>
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
      acc.faq += s.faqEntries.length;
      acc.cust += s.newCustomers.length;
      return acc;
    },
    { done: 0, br: 0, faq: 0, cust: 0 }
  );
  const highlightBlocks = reports
    .map(({ stats: s, narrative }) => {
      const active = statsActivityCount(s) > 0;
      if (!active && !narrative.trim()) return "";
      return `<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;background:${active ? "#fff" : "#fafafa"}">
        <h4 style="margin:0 0 6px;color:#111827;font-size:14px">${esc(s.name)} <span style="color:#6b7280;font-weight:normal;font-size:12px">${esc(copy.managerDigest.memberStats(s.name, s.doneTodos.length, s.businessRecords.length, s.faqEntries.length, s.newCustomers.length))}</span></h4>
        ${narrativeExcerptHtml(narrative, copy.managerDigest.noNarrative)}
      </div>`;
    })
    .filter(Boolean)
    .join("");
  const t = copy.managerDigest.table;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1f2937">
  <h2 style="margin:0 0 4px">${esc(copy.managerDigest.title)}</h2>
  <p style="color:#6b7280;margin:0 0 16px">${esc(copy.managerDigest.period(window.label, all.length))}</p>
  <p style="margin:0 0 12px">${copy.managerDigest.totals(totals.done, totals.br, totals.faq, totals.cust)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="background:#1d4ed8;color:#fff">
        <th style="padding:8px 10px;text-align:left">${esc(t.member)}</th>
        <th style="padding:8px 10px">${esc(t.doneTodos)}</th>
        <th style="padding:8px 10px">${esc(t.businessRecords)}</th>
        <th style="padding:8px 10px">${esc(t.faqEntries)}</th>
        <th style="padding:8px 10px">${esc(t.newCustomers)}</th>
        <th style="padding:8px 10px">${esc(t.upcomingTodos)}</th>
        <th style="padding:8px 10px">${esc(t.activeOpportunities)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${highlightBlocks ? `<h3 style="margin:24px 0 12px;font-size:16px">${esc(copy.managerDigest.highlightsTitle)}</h3>${highlightBlocks}` : ""}
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
    ${esc(copy.managerDigest.footer)}
  </p>
</div>`;
}

export function renderManagerDigestText(
  reports: WeeklyUserReport[],
  window: WeekWindow,
  copy: WeeklyReportCopy
): string {
  const tableLines = reports.map(({ stats: s }) =>
    copy.managerDigest.rowLine({
      name: s.name,
      doneTodos: s.doneTodos.length,
      businessRecords: s.businessRecords.length,
      faqEntries: s.faqEntries.length,
      newCustomers: s.newCustomers.length,
      upcomingTodos: s.upcomingTodos.length,
      activeOpportunities: s.activeOpportunities.length,
    })
  );
  const excerptLines = reports
    .filter(({ stats: s, narrative }) => statsActivityCount(s) > 0 || narrative.trim())
    .map(
      ({ stats: s, narrative }) =>
        `【${s.name}】\n${narrative.trim() || copy.managerDigest.noActivity}`
    );
  const title = copy.managerDigest.subject(window.label);
  return [
    title,
    "",
    ...tableLines,
    "",
    `--- ${copy.managerDigest.highlightsTitle} ---`,
    "",
    ...excerptLines,
  ].join("\n");
}

// ============ AI 叙述 ============

async function generateNarrative(
  s: WeeklyUserStats,
  window: WeekWindow,
  userId: string | null,
  locale: WeeklyReportLocale
): Promise<string> {
  const copy = getWeeklyReportCopy(locale);
  const dataBlock = renderStatsForPrompt(s, window, copy);
  const messages: ChatMessage[] = [
    { role: "system", content: copy.narrative.system },
    {
      role: "user",
      content: `${dataBlock}\n\n${copy.narrative.user}`,
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
  const next =
    s.upcomingTodos.length || s.activeOpportunities.length
      ? copy.narrative.fallbackNextWithWork
      : copy.narrative.fallbackNextEmpty;
  return `${copy.narrative.fallbackSummary({
    doneTodos: s.doneTodos.length,
    businessRecords: s.businessRecords.length,
    workLogs: s.workLogs.length,
    faqEntries: s.faqEntries.length,
    newCustomers: s.newCustomers.length,
  })}\n\n${next}`;
}

// ============ 管道入口 ============

export type WeeklyPipelineResult = {
  output: string;
  toolLog: { tool: string; args: unknown; result: string }[];
  runStatus: "SUCCESS" | "PARTIAL_SUCCESS";
};

async function persistWeeklyReportSnapshot(data: {
  kind: "PERSONAL" | "MANAGER_DIGEST";
  weekLabel: string;
  windowStart: Date;
  windowEnd: Date;
  locale: string;
  subject: string;
  html: string;
  text: string;
  userId?: string | null;
  userName?: string | null;
  source: "SCHEDULED" | "MANUAL" | "TEST";
  agentRunId?: string | null;
}) {
  try {
    await db.weeklyReportSnapshot.create({
      data: {
        kind: data.kind,
        weekLabel: data.weekLabel,
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
        locale: data.locale,
        subject: data.subject,
        html: data.html,
        text: data.text,
        userId: data.userId ?? null,
        userName: data.userName ?? null,
        source: data.source,
        agentRunId: data.agentRunId ?? null,
      },
    });
  } catch (e) {
    console.error("[weekly-report] persist snapshot failed:", e);
  }
}

export async function runWeeklyReportPipeline(
  agent: Pick<Agent, "queryConfig" | "timezone" | "createdById" | "name">,
  opts: { agentRunId?: string | null; source?: "SCHEDULED" | "MANUAL" } = {},
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

  const [roleUsers, managerUsers] = await Promise.all([
    resolveTargetUsers(config.roles),
    resolveManagerUsers(config.managers),
  ]);
  const users = mergeWeeklyReportUsers(roleUsers, managerUsers);
  const localeMap = buildWeeklyReportLocaleMap(users, config);
  toolLog.push({
    tool: "resolve_users",
    args: { roles: config.roles, managers: config.managers },
    result: `${users.length} user(s): ${users.map((u) => u.name).join(", ") || "none"}`,
  });

  // 逐人聚合 + 生成 AI 叙述（个人邮件与管理者汇总共用）
  const allReports: WeeklyUserReport[] = [];
  for (const u of users) {
    const locale = localeMap.get(u.id) ?? "zh";
    const stats = await gatherUserWeekly(u, window, locale);
    const active = statsActivityCount(stats) > 0;
    const narrative =
      active || config.includeInactive
        ? await generateNarrative(stats, window, agent.createdById, locale)
        : "";
    allReports.push({ stats, narrative, locale });
  }

  const { emails: managerEmails, resolved: managerResolved } = await resolveManagerEmails(config.managers);
  const ccManagers = managerEmails.join(",");

  // 逐人发个人周报（抄送管理者）
  let sentPersonal = 0;
  let skippedNoEmail = 0;
  let skippedInactive = 0;
  for (const { stats: s, narrative, locale } of allReports) {
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
    const copy = getWeeklyReportCopy(locale);
    const html = renderUserEmailHtml(s, window, narrative, copy);
    const text = renderUserEmailText(s, window, narrative, copy);
    const subject = copy.email.personalSubject(window.label);
    const cc = managerEmails.filter((e) => e.toLowerCase() !== s.email!.toLowerCase()).join(",");
    const ctx = { actions: [] as string[] };
    const result = await runSendEmailTool(
      { to: s.email, ...(cc ? { cc } : {}), subject, body: text, html },
      ctx
    );
    const ok = /Email sent/i.test(result);
    if (ok) sentPersonal++;
    toolLog.push({
      tool: "send_email",
      args: { to: s.email, cc: cc || undefined, subject },
      result: result.slice(0, 200),
    });
    await persistWeeklyReportSnapshot({
      kind: "PERSONAL",
      weekLabel: window.label,
      windowStart: window.start,
      windowEnd: window.end,
      locale,
      subject,
      html,
      text,
      userId: s.userId,
      userName: s.name,
      source: opts.source ?? "SCHEDULED",
      agentRunId: opts.agentRunId,
    });
  }
  pushNotes.push(`个人周报已发 ${sentPersonal} 人${ccManagers ? "（抄送管理者）" : ""}`);
  if (skippedInactive) pushNotes.push(`跳过无活动 ${skippedInactive} 人`);
  if (skippedNoEmail) pushNotes.push(`无邮箱跳过 ${skippedNoEmail} 人`);

  // 管理者汇总
  let managerOk = false;
  const unresolved = managerResolved.filter((r) => !r.email).map((r) => r.token);
  if (managerEmails.length) {
    const digestLocale = config.managerDigestLocale ?? "zh";
    const digestCopy = getWeeklyReportCopy(digestLocale);
    const html = renderManagerDigestHtml(allReports, window, digestCopy);
    const text = renderManagerDigestText(allReports, window, digestCopy);
    const subject = digestCopy.managerDigest.subject(window.label);
    const ctx = { actions: [] as string[] };
    const result = await runSendEmailTool(
      { to: managerEmails.join(","), subject, body: text, html },
      ctx
    );
    managerOk = /Email sent/i.test(result);
    toolLog.push({ tool: "send_email", args: { to: managerEmails, subject }, result: result.slice(0, 200) });
    pushNotes.push(managerOk ? `管理者汇总已发（${managerEmails.length} 人）` : `管理者汇总发送失败`);
    await persistWeeklyReportSnapshot({
      kind: "MANAGER_DIGEST",
      weekLabel: window.label,
      windowStart: window.start,
      windowEnd: window.end,
      locale: digestLocale,
      subject,
      html,
      text,
      source: opts.source ?? "SCHEDULED",
      agentRunId: opts.agentRunId,
    });
  } else {
    pushNotes.push("管理者汇总未发（未解析到收件人）");
  }
  if (unresolved.length) pushNotes.push(`未识别管理者：${unresolved.join("、")}`);

  // 运行结果
  const allOk =
    (sentPersonal > 0 || skippedInactive === allReports.length || allReports.length === 0) &&
    (managerEmails.length === 0 || managerOk) &&
    unresolved.length === 0 &&
    skippedNoEmail === 0;
  const runStatus: "SUCCESS" | "PARTIAL_SUCCESS" = allOk ? "SUCCESS" : "PARTIAL_SUCCESS";

  const summaryLines = allReports.map(
    ({ stats: s }) =>
      `- ${s.name}：完成待办 ${s.doneTodos.length} · 商务记录 ${s.businessRecords.length} · 问答库 ${s.faqEntries.length} · 新增客户 ${s.newCustomers.length}`
  );
  const output = `### 团队周报（${window.label}）

覆盖 **${allReports.length}** 人（角色：${config.roles.join("/")}）

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
  agentConfig?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const user = await db.user.findUnique({
    where: { id: opts.userId },
    select: {
      id: true,
      name: true,
      email: true,
      reportLocale: true,
      wecomDisplayName: true,
      crmSalesmanName: true,
    },
  });
  if (!user) return { ok: false, message: "未找到该用户" };

  const to = (opts.toEmailOverride?.trim() || user.email || "").trim();
  if (!to) return { ok: false, message: `${user.name} 没有邮箱，且未指定收件邮箱` };

  const agent = opts.agentConfig
    ? parseWeeklyReportConfig(opts.agentConfig)
    : null;
  const locale = agent
    ? resolveWeeklyReportLocale(user, agent)
    : normalizeWeeklyReportLocale(user.reportLocale) ?? "zh";
  const copy = getWeeklyReportCopy(locale);

  const tz = resolveAgentTimezone(opts.timezone);
  const window = computeWorkWeekWindow(new Date(), tz);
  const stats = await gatherUserWeekly(user, window, locale);
  const narrative = await generateNarrative(stats, window, opts.creatorId ?? null, locale);
  const html = renderUserEmailHtml(stats, window, narrative, copy);
  const text = renderUserEmailText(stats, window, narrative, copy);
  const subject = copy.email.testSubject(user.name, window.label);

  const ctx = { actions: [] as string[] };
  const result = await runSendEmailTool({ to, subject, body: text, html }, ctx);
  const ok = /Email sent/i.test(result);
  await persistWeeklyReportSnapshot({
    kind: "PERSONAL",
    weekLabel: window.label,
    windowStart: window.start,
    windowEnd: window.end,
    locale,
    subject,
    html,
    text,
    userId: user.id,
    userName: user.name,
    source: "TEST",
  });
  return {
    ok,
    message: ok
      ? `已试发 ${user.name} 的周报至 ${to}（完成待办 ${stats.doneTodos.length}·商务记录 ${stats.businessRecords.length}·问答库 ${stats.faqEntries.length}·新增客户 ${stats.newCustomers.length}）`
      : `试发失败：${result.slice(0, 160)}`,
  };
}
