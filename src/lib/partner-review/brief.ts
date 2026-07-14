import "server-only";

import { db } from "../db";
import { chatJson } from "../ai";
import type { PartnerPrepBrief } from "./types";

export type { PartnerPrepBrief } from "./types";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function preview(text: string | null | undefined, max = 120) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** 确定性聚合：近 2 周该伙伴的进展 / 时间线 / 待办 / 商机 */
export async function gatherPartnerReviewFacts(partnerId: string, since: Date = daysAgo(14)) {
  const now = new Date();
  const [partner, businessRecords, events, openTodos, opportunities] = await Promise.all([
    db.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, tier: true, pipelineStage: true, notes: true },
    }),
    db.businessRecord.findMany({
      where: { partnerId, occurredAt: { gte: since, lte: now } },
      orderBy: { occurredAt: "desc" },
      take: 20,
      select: { title: true, category: true, occurredAt: true, content: true },
    }),
    db.timelineEvent.findMany({
      where: { partnerId, createdAt: { gte: since, lte: now } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true, type: true, createdAt: true },
    }),
    db.todoItem.findMany({
      where: { partnerId, status: "OPEN" },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 30,
      select: { id: true, title: true, dueDate: true, priority: true, detail: true },
    }),
    db.opportunity.findMany({
      where: { partnerId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, name: true, stage: true, amount: true },
    }),
  ]);

  if (!partner) return null;

  return {
    partner,
    windowLabel: `${ymd(since)} ~ ${ymd(now)}`,
    businessRecords,
    events,
    openTodos,
    opportunities,
    now,
  };
}

function renderFactsForPrompt(facts: NonNullable<Awaited<ReturnType<typeof gatherPartnerReviewFacts>>>) {
  const lines: string[] = [];
  lines.push(`伙伴：${facts.partner.name}（Tier ${facts.partner.tier ?? "-"} / Stage ${facts.partner.pipelineStage}）`);
  lines.push(`时间窗：${facts.windowLabel}`);
  lines.push("");
  lines.push("## 近两周商务记录");
  if (!facts.businessRecords.length) lines.push("（无）");
  for (const r of facts.businessRecords) {
    lines.push(`- [${r.category}] ${r.title} (${ymd(r.occurredAt)}) ${preview(r.content)}`);
  }
  lines.push("");
  lines.push("## 近两周活动时间线");
  if (!facts.events.length) lines.push("（无）");
  for (const e of facts.events) {
    lines.push(`- [${e.type}] ${e.title} (${ymd(e.createdAt)})`);
  }
  lines.push("");
  lines.push("## 开放待办");
  if (!facts.openTodos.length) lines.push("（无）");
  for (const t of facts.openTodos) {
    const due = t.dueDate ? ymd(t.dueDate) : "无截止日期";
    const overdue = t.dueDate && t.dueDate < facts.now ? "逾期" : "";
    lines.push(`- ${t.title} [${t.priority}] ${due} ${overdue} ${preview(t.detail, 80)}`);
  }
  lines.push("");
  lines.push("## 活跃商机");
  if (!facts.opportunities.length) lines.push("（无）");
  for (const o of facts.opportunities) {
    lines.push(`- ${o.name} / ${o.stage}${o.amount ? ` / ${o.amount}` : ""}`);
  }
  if (facts.partner.notes?.trim()) {
    lines.push("");
    lines.push("## 伙伴备注");
    lines.push(preview(facts.partner.notes, 400));
  }
  return lines.join("\n");
}

export async function buildPartnerPrepBrief(
  partnerId: string,
  opts: { userId?: string } = {},
): Promise<PartnerPrepBrief | null> {
  const facts = await gatherPartnerReviewFacts(partnerId);
  if (!facts) return null;

  const progress = facts.businessRecords.map((r) => ({
    title: r.title,
    category: r.category,
    occurredAt: r.occurredAt.toISOString(),
    contentPreview: preview(r.content),
  }));
  const timeline = facts.events.map((e) => ({
    title: e.title,
    type: e.type,
    createdAt: e.createdAt.toISOString(),
  }));
  const openTodos = facts.openTodos.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate?.toISOString() ?? null,
    overdue: !!(t.dueDate && t.dueDate < facts.now),
    priority: t.priority,
  }));
  const opportunities = facts.opportunities.map((o) => ({
    id: o.id,
    name: o.name,
    stage: o.stage,
    amount: o.amount,
  }));

  let aiTopics: string[] = [];
  let summaryLine = "";

  try {
    const ai = await chatJson<{ topics?: string[]; summary?: string }>(
      `你是伙伴经营教练。根据给定的确定性事实，为内部「过伙伴」会议推荐 3～5 条值得讨论的议题。
只输出 JSON：{"topics":["..."],"summary":"一句话进展综述"}
议题要具体、可行动，不要空话。事实已给定，不要编造不存在的进展。`,
      renderFactsForPrompt(facts),
      {
        feature: "partner_review_prep",
        userId: opts.userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.3,
      },
    );
    aiTopics = (ai.topics ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6);
    summaryLine = String(ai.summary ?? "").trim();
  } catch {
    if (openTodos.some((t) => t.overdue)) {
      aiTopics.push("跟进逾期待办，明确责任人与截止日期");
    }
    if (opportunities.length) {
      aiTopics.push(`盘点活跃商机推进卡点（共 ${opportunities.length} 个）`);
    }
    if (!progress.length) {
      aiTopics.push("近两周无商务记录，确认是否需要拜访/培训动作");
    }
    if (!aiTopics.length) aiTopics.push("回顾当前合作阶段与下一步动作");
    summaryLine = `近两周 ${progress.length} 条商务记录，${openTodos.length} 个开放待办，${opportunities.length} 个活跃商机。`;
  }

  return {
    partnerId: facts.partner.id,
    partnerName: facts.partner.name,
    windowLabel: facts.windowLabel,
    progress,
    timeline,
    openTodos,
    opportunities,
    aiTopics,
    summaryLine,
  };
}

export async function generateMeetingPrepBriefs(meetingId: string, userId?: string) {
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!meeting) throw new Error("会议不存在");

  for (const item of meeting.items) {
    const brief = await buildPartnerPrepBrief(item.partnerId, { userId });
    if (!brief) continue;
    await db.partnerReviewItem.update({
      where: { id: item.id },
      data: { prepBrief: JSON.stringify(brief) },
    });
  }

  await db.partnerReviewMeeting.update({
    where: { id: meetingId },
    data: {
      prepGeneratedAt: new Date(),
      status: meeting.status === "DRAFT" ? "PREP" : meeting.status,
    },
  });
}
