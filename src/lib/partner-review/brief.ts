import "server-only";

import { db } from "../db";
import { chatJson } from "../ai";
import type { PartnerPrepBrief } from "./types";
import { parseMossFitLevelFromSnapshot } from "../moss-dossier";
import { formatProcessTagsDisplay } from "../opportunity-process-tags";
import {
  normalizeOpportunityStatus,
  OPPORTUNITY_STATUS_LABELS_ZH,
} from "../opportunity-status";
import { partnerRelatedOpportunityWhere } from "../partner-opportunities";

export type { PartnerPrepBrief } from "./types";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

const CATEGORY_LABEL: Record<string, string> = {
  VISIT: "拜访",
  TRAINING: "培训",
  NEGOTIATION: "谈判",
  DELIVERY: "交付",
  RELATIONSHIP: "关系",
  OTHER: "进展",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? "进展";
}

/** 去掉重复短句，压缩空白 */
export function tidyProgressText(text: string | null | undefined, max = 360): string {
  let flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";

  for (let len = 8; len <= 40; len++) {
    const re = new RegExp(`(.{${len}})(\\1)+`, "g");
    flat = flat.replace(re, "$1");
  }
  flat = flat.replace(/([。！？；.!?])\1+/g, "$1").trim();

  if (flat.length > max) return `${flat.slice(0, max)}…`;
  return flat;
}

function extractContactName(text: string): string | null {
  const m = text.match(/【联系人\s*([^】]+)】/);
  return m?.[1]?.trim() || null;
}

function stripContactTag(text: string): string {
  return text.replace(/【联系人\s*[^】]+】\s*/g, "").trim();
}

function opportunityStatusLabel(status: string): string {
  const code = normalizeOpportunityStatus(status);
  return OPPORTUNITY_STATUS_LABELS_ZH[code];
}

type RawOpportunity = {
  id: string;
  name: string;
  stage: string;
  amount: string | null;
  status: string;
  customer: { id: string; name: string } | null;
};

function groupOpportunitiesByCustomer(opportunities: RawOpportunity[]): PartnerPrepBrief["customerOpportunities"] {
  const map = new Map<string, PartnerPrepBrief["customerOpportunities"][number]>();

  for (const o of opportunities) {
    const customerId = o.customer?.id ?? "__unassigned__";
    const customerName = o.customer?.name ?? "未关联客户";
    if (!map.has(customerId)) {
      map.set(customerId, { customerId, customerName, opportunities: [] });
    }
    const status = normalizeOpportunityStatus(o.status);
    map.get(customerId)!.opportunities.push({
      id: o.id,
      name: o.name,
      stage: formatProcessTagsDisplay(o.stage, "zh"),
      amount: o.amount,
      status,
      statusLabel: opportunityStatusLabel(o.status),
    });
  }

  return [...map.values()].sort((a, b) => {
    if (a.customerId === "__unassigned__") return 1;
    if (b.customerId === "__unassigned__") return -1;
    return a.customerName.localeCompare(b.customerName, "zh-CN");
  });
}

/** 确定性聚合：近 2 周该伙伴的进展 / 时间线 / 待办 / 客户商机 */
export async function gatherPartnerReviewFacts(partnerId: string, since: Date = daysAgo(14)) {
  const now = new Date();
  const [partner, businessRecords, events, openTodos, doneTodos, opportunities] = await Promise.all([
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
      select: { id: true, title: true, dueDate: true, priority: true, detail: true, status: true },
    }),
    db.todoItem.findMany({
      where: {
        partnerId,
        status: "DONE",
        OR: [{ doneAt: { gte: since } }, { updatedAt: { gte: since }, doneAt: null }],
      },
      orderBy: [{ doneAt: "desc" }, { updatedAt: "desc" }],
      take: 20,
      select: { id: true, title: true, dueDate: true, priority: true, detail: true, status: true },
    }),
    db.opportunity.findMany({
      where: partnerRelatedOpportunityWhere(partnerId),
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        status: true,
        customer: { select: { id: true, name: true } },
      },
    }),
  ]);

  if (!partner) return null;

  return {
    partner,
    windowLabel: `${ymd(since)} ~ ${ymd(now)}`,
    businessRecords,
    events,
    openTodos,
    doneTodos,
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
    lines.push(
      `- [${categoryLabel(r.category)}] ${r.title} (${ymd(r.occurredAt)}) ${tidyProgressText(r.content, 160)}`,
    );
  }
  lines.push("");
  lines.push("## 近两周活动时间线");
  if (!facts.events.length) lines.push("（无）");
  for (const e of facts.events) {
    lines.push(`- [${e.type}] ${e.title} (${ymd(e.createdAt)})`);
  }
  lines.push("");
  lines.push("## 待办（未完成）");
  if (!facts.openTodos.length) lines.push("（无）");
  for (const t of facts.openTodos) {
    const due = t.dueDate ? ymd(t.dueDate) : "无截止日期";
    const overdue = t.dueDate && t.dueDate < facts.now ? "逾期" : "";
    lines.push(`- [ ] ${t.title} [${t.priority}] ${due} ${overdue} ${tidyProgressText(t.detail, 80)}`);
  }
  lines.push("");
  lines.push("## 待办（近两周已完成）");
  if (!facts.doneTodos.length) lines.push("（无）");
  for (const t of facts.doneTodos) {
    lines.push(`- [x] ${t.title}`);
  }
  lines.push("");
  lines.push("## 该伙伴下客户的进行中商机");
  if (!facts.opportunities.length) lines.push("（无）");
  const grouped = groupOpportunitiesByCustomer(facts.opportunities);
  for (const g of grouped) {
    lines.push(`### ${g.customerName}`);
    for (const o of g.opportunities) {
      lines.push(
        `- ${o.name} / ${o.stage} / ${o.statusLabel}${o.amount ? ` / ${o.amount}` : ""}`,
      );
    }
  }
  if (facts.partner.notes?.trim()) {
    lines.push("");
    lines.push("## 伙伴备注");
    lines.push(tidyProgressText(facts.partner.notes, 400));
  }
  return lines.join("\n");
}

export async function buildPartnerPrepBrief(
  partnerId: string,
  opts: { userId?: string } = {},
): Promise<PartnerPrepBrief | null> {
  const facts = await gatherPartnerReviewFacts(partnerId);
  if (!facts) return null;

  const progress = facts.businessRecords.map((r) => {
    const body = tidyProgressText(r.content, 420);
    const contactName = extractContactName(body);
    const contentPreview = stripContactTag(body);
    const titleLooksLikeBody =
      !!contentPreview &&
      (contentPreview.startsWith(r.title.trim()) || r.title.trim().length > 40);
    return {
      title: titleLooksLikeBody ? contentPreview.slice(0, 48) || r.title : r.title,
      category: r.category,
      categoryLabel: categoryLabel(r.category),
      occurredAt: r.occurredAt.toISOString(),
      contentPreview: titleLooksLikeBody ? contentPreview : contentPreview || "",
      contactName,
    };
  });
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
  const todos: PartnerPrepBrief["todos"] = [
    ...facts.openTodos.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      overdue: !!(t.dueDate && t.dueDate < facts.now),
      priority: t.priority,
      done: false,
    })),
    ...facts.doneTodos.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      overdue: false,
      priority: t.priority,
      done: true,
    })),
  ];

  const customerOpportunities = groupOpportunitiesByCustomer(facts.opportunities);

  const realCustomerIds = customerOpportunities
    .map((g) => g.customerId)
    .filter((id) => id && id !== "__unassigned__");
  const mossCustomers =
    realCustomerIds.length > 0
      ? await db.customer.findMany({
          where: { id: { in: realCustomerIds } },
          select: { id: true, creditCode: true, mossSnapshot: true, mossSyncedAt: true },
        })
      : [];
  const mossByCustomerId = new Map(mossCustomers.map((c) => [c.id, c]));
  const enrichedCustomerOpportunities = customerOpportunities.map((group) => {
    if (group.customerId === "__unassigned__") return group;
    const row = mossByCustomerId.get(group.customerId);
    return {
      ...group,
      creditCode: row?.creditCode ?? null,
      mossFitLevel: row?.mossSnapshot ? parseMossFitLevelFromSnapshot(row.mossSnapshot) : null,
      mossSyncedAt: row?.mossSyncedAt?.toISOString() ?? null,
    };
  });

  const opportunities = facts.opportunities.map((o) => ({
    id: o.id,
    name: o.name,
    stage: formatProcessTagsDisplay(o.stage, "zh"),
    amount: o.amount,
    customerId: o.customer?.id ?? null,
    customerName: o.customer?.name ?? null,
    status: normalizeOpportunityStatus(o.status),
    statusLabel: opportunityStatusLabel(o.status),
  }));

  let aiTopics: string[] = [];
  let summaryLine = "";

  try {
    const ai = await chatJson<{ topics?: string[]; summary?: string }>(
      `你是伙伴经营教练。根据给定的确定性事实，为内部「过伙伴」会议推荐 3～5 条值得讨论的议题。
只输出 JSON：{"topics":["..."],"summary":"一句话进展综述"}
议题要具体、可行动，不要空话。事实已给定，不要编造不存在的进展。若有多条客户商机，可结合客户维度给出推进建议。`,
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
      aiTopics.push(`盘点各客户商机推进卡点（共 ${opportunities.length} 个进行中）`);
    }
    if (!progress.length) {
      aiTopics.push("近两周无商务记录，确认是否需要拜访/培训动作");
    }
    if (!aiTopics.length) aiTopics.push("回顾当前合作阶段与下一步动作");
    summaryLine = `近两周 ${progress.length} 条进展，${openTodos.length} 个未完成待办，${facts.doneTodos.length} 个已完成，${opportunities.length} 个客户商机进行中。`;
  }

  return {
    partnerId: facts.partner.id,
    partnerName: facts.partner.name,
    windowLabel: facts.windowLabel,
    progress,
    timeline,
    todos,
    openTodos,
    opportunities,
    customerOpportunities: enrichedCustomerOpportunities,
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
