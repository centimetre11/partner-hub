import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { PARTNER_FIELD_LABELS, PIPELINE_STAGES, attitudeLabel, stageName } from "./constants";
import { normalizeIndustriesInput } from "./taxonomy";

// ============ 提案（diff 预览）数据结构 ============

export type FieldUpdate = {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string;
  reason?: string;
};

export type ContactProposal = {
  action: "add" | "update";
  id?: string;
  name: string;
  role?: string; // APPROVER / DECISION_MAKER / SUPPORTER / EVALUATOR / INFLUENCER
  title?: string;
  department?: string;
  attitude?: number; // 3教练 / 2支持并排他 / 1支持不排他 / 0未接触或中立 / -1反对
  reportsToName?: string; // 汇报上级姓名（用于权力地图层级）
  contactInfo?: string;
  approach?: string;
  notes?: string;
  reason?: string;
};

export type OpportunityProposal = {
  action: "add" | "update";
  id?: string;
  name: string;
  client?: string;
  amount?: string;
  stage?: string;
  nextStep?: string;
  status?: string;
  notes?: string;
  reason?: string;
};

export type TodoProposal = {
  title: string;
  detail?: string;
  dueDate?: string; // YYYY-MM-DD
  priority?: string;
};

export type ExtractionProposal = {
  partnerId?: string;
  partnerName?: string;
  summaryTitle: string;
  summary: string;
  fieldUpdates: FieldUpdate[];
  contacts: ContactProposal[];
  opportunities: OpportunityProposal[];
  todos: TodoProposal[];
  signals: string[];
};

// ============ 构建伙伴上下文（供提示词使用） ============

export async function partnerContext(partnerId: string): Promise<string> {
  const p = await db.partner.findUnique({
    where: { id: partnerId },
    include: { contacts: true, opportunities: true, owner: true },
  });
  if (!p) return "（伙伴不存在）";
  const fields = Object.entries(PARTNER_FIELD_LABELS)
    .map(([field, label]) => {
      const v = (p as unknown as Record<string, unknown>)[field];
      const display = field === "pipelineStage" ? `${v}（${stageName(Number(v))}）` : v ?? "（空）";
      return `- ${label}[${field}]: ${display}`;
    })
    .join("\n");
  const contactById = new Map(p.contacts.map((c) => [c.id, c.name]));
  const contacts = p.contacts.length
    ? p.contacts
        .map(
          (c) =>
            `- id=${c.id} 姓名:${c.name} 角色:${c.role} 职位:${c.title ?? "?"} 部门:${c.department ?? "?"} 态度:${c.attitude}(${attitudeLabel(c.attitude)}) 汇报给:${c.reportsToId ? contactById.get(c.reportsToId) ?? "?" : "（顶层）"} 联系方式:${c.contactInfo ?? "?"}`
        )
        .join("\n")
    : "（暂无）";
  const opps = p.opportunities.length
    ? p.opportunities
        .map(
          (o) =>
            `- id=${o.id} 名称:${o.name} 客户:${o.client ?? "?"} 金额:${o.amount ?? "?"} 阶段:${o.stage} 状态:${o.status}`
        )
        .join("\n")
    : "（暂无）";
  return `【伙伴档案：${p.name}】\n${fields}\n\n【权力地图/关键人物】\n${contacts}\n\n【商机列表】\n${opps}`;
}

/** AI 加人专用：只传现有联系人名单，不含整份画像/商机 */
export async function powermapContext(partnerId: string): Promise<string> {
  const p = await db.partner.findUnique({
    where: { id: partnerId },
    select: {
      name: true,
      contacts: {
        select: { id: true, name: true, role: true, title: true, department: true, reportsToId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!p) return "（伙伴不存在）";
  const byId = new Map(p.contacts.map((c) => [c.id, c.name]));
  const lines = p.contacts.length
    ? p.contacts
        .map(
          (c) =>
            `- id=${c.id} ${c.name} | 角色:${c.role} | ${c.title ?? "—"} | ${c.department ?? "—"} | 汇报:${c.reportsToId ? byId.get(c.reportsToId) ?? "?" : "顶层"}`,
        )
        .join("\n")
    : "（暂无，全部为新增）";
  return `【伙伴：${p.name}】\n【现有联系人】\n${lines}`;
}

// ============ AI 抽取：从任意文本生成提案 ============

const EXTRACT_SYSTEM = `你是帆软软件（Fanruan，中国领先的BI厂商，产品有 FineReport / FineBI / FineDataLink）中东区伙伴管理系统的信息抽取引擎。
用户会提供一段原始文本（会议速记、WhatsApp/微信聊天记录、邮件、新闻等），以及当前伙伴档案。
你的任务：对比文本与现有档案，抽取出需要更新的信息，输出 JSON 提案。规则：
1. 只提出文本中有依据的变更，不要编造。每条变更附 reason（引用原文关键句）。
2. fieldUpdates 仅限这些字段：${Object.entries(PARTNER_FIELD_LABELS).map(([f, l]) => `${f}(${l})`).join("、")}。newValue 一律为字符串；pipelineStage 为 1-10 数字字符串（${PIPELINE_STAGES.map((s) => `${s.stage}=${s.name}`).join("，")}）。
3. 文本中出现的人物（权力地图）：若不在现有联系人中则 action=add；若已存在但有新信息（职位、部门、态度、汇报关系、联系方式变化）则 action=update 并带上其 id。字段：
   - role 角色：APPROVER(审批者)/DECISION_MAKER(决策者)/SUPPORTER(支持者)/EVALUATOR(评估者)/INFLUENCER(影响者)
   - attitude 态度评分：3=教练（主动帮我们）/2=支持并排他/1=支持不排他/0=未接触或中立/-1=反对
   - department 部门；reportsToName 汇报上级的姓名（文本中能判断汇报/隶属关系时填写，用于组织架构层级）
4. 商机：新商机 action=add；已有商机的金额/阶段/进展变化 action=update 带 id。
5. todos：文本中的承诺事项、约定的下一步，转为待办（中文标题，能定日期就给 dueDate，格式 YYYY-MM-DD；priority 取 HIGH/MEDIUM/LOW）。
6. summary：用 3-6 句话总结这段文本的关键信息（中文）；summaryTitle 是一句话标题。
7. signals：值得注意的积极信号或风险信号（中文短句数组，没有则空数组）。
只输出 JSON 对象，结构：
{"summaryTitle": "...", "summary": "...", "fieldUpdates": [{"field":"...","label":"...","oldValue":"...","newValue":"...","reason":"..."}], "contacts": [...], "opportunities": [...], "todos": [...], "signals": [...]}`;

export async function extractProposal(opts: {
  partnerId: string;
  text: string;
  sourceType: string;
  today: string;
  userId?: string;
}): Promise<ExtractionProposal> {
  const ctx = await partnerContext(opts.partnerId);
  const user = `今天日期：${opts.today}\n文本类型：${opts.sourceType}\n\n${ctx}\n\n【原始文本】\n${opts.text}`;
  const raw = await chatJson<Partial<ExtractionProposal>>(EXTRACT_SYSTEM, user, {
    feature: "AI 信息抽取",
    userId: opts.userId,
  });
  return normalizeProposal(raw, opts.partnerId);
}

export function normalizeProposal(raw: Partial<ExtractionProposal>, partnerId?: string): ExtractionProposal {
  return {
    partnerId,
    partnerName: raw.partnerName,
    summaryTitle: raw.summaryTitle || "AI 信息整理",
    summary: raw.summary || "",
    fieldUpdates: (raw.fieldUpdates ?? []).filter((f) => f.field in PARTNER_FIELD_LABELS && f.field !== "name"),
    contacts: raw.contacts ?? [],
    opportunities: raw.opportunities ?? [],
    todos: raw.todos ?? [],
    signals: raw.signals ?? [],
  };
}

// ============ 识别文本归属哪个伙伴 ============

export async function guessPartner(text: string, userId?: string): Promise<{ partnerId: string | null; partnerName: string | null; confidence: string }> {
  const partners = await db.partner.findMany({ select: { id: true, name: true, city: true, country: true } });
  const list = partners.map((p) => `${p.id} | ${p.name}（${p.city ?? "?"}, ${p.country ?? "?"}）`).join("\n");
  const res = await chatJson<{ partnerId: string | null; partnerName: string | null; confidence: string }>(
    `你是伙伴管理系统的路由器。根据文本内容判断它与系统中哪个伙伴公司相关。只输出 JSON：{"partnerId": "匹配到的id或null", "partnerName": "匹配到的名称或null", "confidence": "high/medium/low"}。判断依据：公司名、人名、产品、城市等线索。匹配不上就返回 null。`,
    `【系统中的伙伴列表】\n${list}\n\n【文本】\n${text.slice(0, 4000)}`,
    { feature: "AI 文本归属识别", userId }
  );
  return res;
}

// ============ 应用提案（人工确认后写库 + 审计） ============

export type ApplyResult = { applied: string[]; eventId: string };

export async function applyProposal(opts: {
  partnerId: string;
  proposal: ExtractionProposal;
  userId: string;
  eventType: string; // MEETING / CHAT_IMPORT / NEWS / NOTE
  sourceText?: string;
}): Promise<ApplyResult> {
  const { partnerId, proposal, userId } = opts;
  const partner = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  const applied: string[] = [];

  // 字段更新
  const data: Record<string, unknown> = {};
  for (const f of proposal.fieldUpdates) {
    if (!(f.field in PARTNER_FIELD_LABELS) || f.field === "name") continue;
    if (f.field === "pipelineStage" || f.field === "fitScore") {
      const n = parseInt(f.newValue, 10);
      if (!Number.isNaN(n)) data[f.field] = n;
    } else if (f.field === "industries" || f.field === "industry") {
      const norm = normalizeIndustriesInput(f.newValue);
      data.industries = norm.industries;
      data.industry = norm.industry;
    } else {
      data[f.field] = f.newValue;
    }
    applied.push(`字段「${f.label || PARTNER_FIELD_LABELS[f.field]}」更新为：${f.newValue}`);
  }
  if (Object.keys(data).length) {
    await db.partner.update({ where: { id: partnerId }, data: data as Prisma.PartnerUpdateInput });
  }

  // 联系人
  const VALID_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];
  for (const c of proposal.contacts) {
    // 汇报上级：按姓名解析为已有联系人 id
    let reportsToId: string | undefined;
    if (c.reportsToName) {
      const boss = await db.contact.findFirst({
        where: { partnerId, name: { contains: c.reportsToName }, NOT: { name: c.name } },
      });
      reportsToId = boss?.id;
    }
    const payload = {
      name: c.name,
      role: c.role && VALID_ROLES.includes(c.role) ? c.role : "INFLUENCER",
      title: c.title,
      department: c.department,
      attitude: typeof c.attitude === "number" && c.attitude >= -1 && c.attitude <= 3 ? c.attitude : undefined,
      reportsToId,
      contactInfo: c.contactInfo,
      approach: c.approach,
      notes: c.notes,
    };
    if (c.action === "update" && c.id) {
      const exists = await db.contact.findFirst({ where: { id: c.id, partnerId } });
      if (exists) {
        await db.contact.update({
          where: { id: c.id },
          data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
        });
        applied.push(`更新联系人：${c.name}`);
        continue;
      }
    }
    // add（或 update 但找不到原记录时按姓名兜底）
    const sameName = await db.contact.findFirst({ where: { partnerId, name: c.name } });
    if (sameName) {
      await db.contact.update({
        where: { id: sameName.id },
        data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
      });
      applied.push(`更新联系人：${c.name}`);
    } else {
      await db.contact.create({ data: { partnerId, ...payload } });
      applied.push(`新增联系人：${c.name}`);
    }
  }

  // 商机
  for (const o of proposal.opportunities) {
    const payload = {
      name: o.name,
      client: o.client,
      amount: o.amount,
      stage: o.stage ?? "需求诊断",
      nextStep: o.nextStep,
      status: o.status ?? "ACTIVE",
      notes: o.notes,
    };
    if (o.action === "update" && o.id) {
      const exists = await db.opportunity.findFirst({ where: { id: o.id, partnerId } });
      if (exists) {
        await db.opportunity.update({
          where: { id: o.id },
          data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
        });
        applied.push(`更新商机：${o.name}`);
        continue;
      }
    }
    const sameName = await db.opportunity.findFirst({ where: { partnerId, name: o.name } });
    if (sameName) {
      await db.opportunity.update({
        where: { id: sameName.id },
        data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
      });
      applied.push(`更新商机：${o.name}`);
    } else {
      await db.opportunity.create({ data: { partnerId, ...payload } });
      applied.push(`新增商机：${o.name}`);
    }
  }

  // 待办
  for (const t of proposal.todos) {
    await db.todoItem.create({
      data: {
        title: t.title,
        detail: t.detail,
        partnerId,
        assigneeId: userId,
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        priority: t.priority && ["HIGH", "MEDIUM", "LOW"].includes(t.priority) ? t.priority : "MEDIUM",
        source: "AI",
      },
    });
    applied.push(`新增待办：${t.title}`);
  }

  // 时间线 + 审计
  const event = await db.timelineEvent.create({
    data: {
      partnerId,
      type: opts.eventType,
      title: proposal.summaryTitle || `AI 整理（${partner.name}）`,
      content:
        proposal.summary +
        (proposal.signals.length ? `\n\n信号：\n${proposal.signals.map((s) => `· ${s}`).join("\n")}` : ""),
      createdById: userId,
      meta: JSON.stringify({
        applied,
        proposal,
        sourceText: opts.sourceText?.slice(0, 8000),
      }),
    },
  });

  return { applied, eventId: event.id };
}
