import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { chatCompletion, parseJsonLoose, type ChatMessage } from "./ai";
import {
  CATEGORY_LABELS,
  PARTNER_FIELD_LABELS,
  PIPELINE_STAGES,
  SOLUTION_STATUS_LABELS,
} from "./constants";
import { partnerContext, type ContactProposal, type FieldUpdate, type OpportunityProposal, type TodoProposal } from "./proposals";

// ============ Intake 作用域 ============

export type IntakeScope =
  | "new_partner"
  | "powermap"
  | "opportunity"
  | "profile"
  | "training"
  | "todo"
  | "solution";

export type TrainingProposal = {
  person: string;
  currentSkill?: string;
  targetCert?: string;
  method?: string;
  deadline?: string; // YYYY-MM-DD
  status?: string; // PLANNED / IN_PROGRESS / DONE
  reason?: string;
};

export type SolutionProposal = {
  name: string;
  targetCustomer?: string;
  painPoint?: string;
  fanruanOffer?: string;
  partnerOffer?: string;
  pricingModel?: string;
  status?: string;
  notes?: string;
  reason?: string;
};

export type IntakeProposal = {
  partnerName?: string;
  summary: string;
  fields: FieldUpdate[];
  contacts: ContactProposal[];
  opportunities: OpportunityProposal[];
  todos: TodoProposal[];
  trainings: TrainingProposal[];
  solutions: SolutionProposal[];
};

export type IntakeTurn = {
  reply: string; // AI 对用户说的话（自然语气，可含追问）
  questions: string[]; // 待澄清要点（引导用）
  ready: boolean; // 信息是否足以入库
  proposal: IntakeProposal;
};

export type IntakeMessage = { role: "user" | "assistant"; content: string };

function emptyProposal(): IntakeProposal {
  return { summary: "", fields: [], contacts: [], opportunities: [], todos: [], trainings: [], solutions: [] };
}

// ============ 各作用域的提示词配置 ============

const FIELD_LIST = Object.entries(PARTNER_FIELD_LABELS)
  .map(([f, l]) => `${f}(${l})`)
  .join("、");

const CATEGORY_LIST = Object.entries(CATEGORY_LABELS)
  .map(([k, v]) => `${k}=${v}`)
  .join("，");

const STAGE_LIST = PIPELINE_STAGES.map((s) => `${s.stage}=${s.name}`).join("，");

const ROLE_LINE = "role 角色：APPROVER(审批者)/DECISION_MAKER(决策者)/SUPPORTER(支持者)/EVALUATOR(评估者)/INFLUENCER(影响者)";
const ATTITUDE_LINE = "attitude 态度评分：3=教练(主动帮我们)/2=支持并排他/1=支持不排他/0=未接触或中立/-1=反对";

type ScopeConfig = {
  title: string;
  intro: string;
  guide: string; // 引导补全清单（软性）
  schemaHint: string; // proposal 里该 scope 应填哪些键
};

const SCOPE_CONFIG: Record<IntakeScope, ScopeConfig> = {
  new_partner: {
    title: "新建伙伴建档",
    intro:
      "用户想新建一个候选伙伴。请从用户提供的会议记录/公司介绍/聊天中，抽取公司画像与可能提到的关键人物、商机。",
    guide:
      "建档至少要有：公司名（partnerName，必填）。建议补全：类别 category、所在国家/城市、核心业务 coreBusiness、核心能力 capability、已知客户 knownClients。这些缺了就友好地问一两个最关键的。",
    schemaHint: `partnerName 填公司名；fields 填其余画像字段（字段名只能用：${FIELD_LIST}，category 取值：${CATEGORY_LIST}，pipelineStage 取 1-10：${STAGE_LIST}）；如文中提到人物则填 contacts，提到商机则填 opportunities。trainings/solutions 留空数组。`,
  },
  powermap: {
    title: "添加权力地图人物",
    intro: "用户想往这个伙伴的权力地图里加人/更新人。请抽取人物信息。",
    guide: `每个人建议补全：职位 title、${ROLE_LINE}、${ATTITUDE_LINE}、所属部门 department、汇报上级 reportsToName。如果用户只给了名字和职位、没说清角色/态度/汇报给谁，就自然地追问最关键的一两点（例如"这个人是拍板的还是评估的？""他汇报给谁？"）。用户说不清楚就跳过，别纠缠。`,
    schemaHint:
      "只填 contacts（action=add 新增 / update 更新并带 id）。fields/opportunities/todos/trainings/solutions 全部留空数组。",
  },
  opportunity: {
    title: "添加商机",
    intro: "用户想往这个伙伴加商机或更新商机进展。",
    guide: "商机建议补全：客户 client、金额 amount、阶段 stage、下一步 nextStep。缺关键信息就问一句。",
    schemaHint: "只填 opportunities。其余留空数组。",
  },
  profile: {
    title: "补全伙伴画像",
    intro: "用户想补全/更新这个伙伴的画像字段。",
    guide: `把用户描述映射到画像字段。字段名只能用：${FIELD_LIST}（category 取值：${CATEGORY_LIST}）。`,
    schemaHint: "只填 fields（FieldUpdate，oldValue 可留空）。其余留空数组。",
  },
  training: {
    title: "添加培训计划",
    intro: "用户想给这个伙伴安排能力培训/认证计划。帆软认证如 FCA-FineBI、FCA-FineReport。",
    guide:
      "每条培训建议补全：人员 person（必填）、当前能力 currentSkill、目标认证 targetCert、截止 deadline(YYYY-MM-DD)、状态 status(PLANNED/IN_PROGRESS/DONE)。缺人员就问。",
    schemaHint: "只填 trainings。其余留空数组。",
  },
  todo: {
    title: "添加待办",
    intro: "用户想记一条或多条待办/跟进事项。",
    guide: "每条待办建议补全：标题 title（必填）、截止 dueDate(YYYY-MM-DD)、优先级 priority(HIGH/MEDIUM/LOW)。",
    schemaHint: "只填 todos。其余留空数组。",
  },
  solution: {
    title: "添加联合解决方案",
    intro: "用户想沉淀一个与该伙伴共创的联合解决方案。",
    guide: `每个方案建议补全：方案名 name（必填）、目标客户 targetCustomer、客户痛点 painPoint、帆软提供 fanruanOffer、伙伴提供 partnerOffer、定价/合作模式 pricingModel、状态 status(${Object.keys(SOLUTION_STATUS_LABELS).join("/")})。`,
    schemaHint: "只填 solutions。其余留空数组。",
  },
};

// ============ 多轮对话抽取 ============

const OUTPUT_SCHEMA = `只输出一个 JSON 对象，结构：
{
  "reply": "你对用户说的话（中文，自然口语，如需澄清就在这里友好地问，一次最多问1-2个最关键的点）",
  "questions": ["待澄清要点1", "..."],
  "ready": true/false,
  "proposal": {
    "partnerName": "（仅 new_partner 用，公司名）",
    "summary": "一句话概述本次要录入的内容",
    "fields": [{"field":"...","label":"...","oldValue":"...","newValue":"...","reason":"原文依据"}],
    "contacts": [{"action":"add|update","id":"（update时）","name":"...","role":"...","title":"...","department":"...","attitude":0,"reportsToName":"...","contactInfo":"...","reason":"..."}],
    "opportunities": [{"action":"add|update","id":"...","name":"...","client":"...","amount":"...","stage":"...","nextStep":"...","status":"...","reason":"..."}],
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","detail":"..."}],
    "trainings": [{"person":"...","currentSkill":"...","targetCert":"...","deadline":"YYYY-MM-DD","status":"PLANNED|IN_PROGRESS|DONE","reason":"..."}],
    "solutions": [{"name":"...","targetCustomer":"...","painPoint":"...","fanruanOffer":"...","partnerOffer":"...","pricingModel":"...","status":"...","reason":"..."}]
  }
}
规则：
- 只提取用户文本中有依据的内容，不要编造；每条尽量带 reason。
- ready 判断：核心必填项齐了就为 true（建议补全项缺失只做软提示，不要因此把 ready 设为 false）。用户明确说"就这些/直接录入/不知道了"时 ready 必须为 true。
- proposal 要带上目前已确认的全部内容（累加，不要每轮清空之前已抽取的）。`;

export async function runIntakeTurn(opts: {
  scope: IntakeScope;
  partnerId?: string;
  messages: IntakeMessage[];
  today: string;
  userId?: string;
}): Promise<IntakeTurn> {
  const cfg = SCOPE_CONFIG[opts.scope];
  let ctx = "";
  if (opts.partnerId) {
    ctx = `\n\n【当前伙伴档案（用于判断新增/更新、解析汇报关系）】\n${await partnerContext(opts.partnerId)}`;
  }

  const system = `你是帆软软件（Fanruan，中国领先BI厂商，产品 FineReport/FineBI/FineDataLink）中东区伙伴管理系统的 AI 录入助手。
今天日期：${opts.today}。
当前任务：${cfg.title}。${cfg.intro}

【引导规则（重要，但不要死板）】
${cfg.guide}
追问要像同事聊天一样自然简短，别像填表。用户提供的信息已经够用时，就直接给出提案并把 ready 设为 true，不要为了凑齐字段反复追问。

【本次提案应填写的范围】
${cfg.schemaHint}
${ctx}

${OUTPUT_SCHEMA}`;

  const chat: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of opts.messages) chat.push({ role: m.role, content: m.content });

  let content: string | null;
  try {
    ({ content } = await chatCompletion(chat, {
      jsonMode: true,
      temperature: 0.3,
      feature: `AI 录入助手：${cfg.title}`,
      userId: opts.userId,
    }));
  } catch {
    chat[0].content += "\n\n务必只输出一个合法 JSON 对象。";
    ({ content } = await chatCompletion(chat, {
      temperature: 0.3,
      feature: `AI 录入助手：${cfg.title}`,
      userId: opts.userId,
    }));
  }
  const raw = parseJsonLoose<Partial<IntakeTurn>>(content ?? "");
  const p: Partial<IntakeProposal> = raw.proposal ?? {};
  return {
    reply: raw.reply || "我整理了一下，请确认。",
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    ready: !!raw.ready,
    proposal: {
      partnerName: p.partnerName,
      summary: p.summary || "",
      fields: (p.fields ?? []).filter((f) => f.field in PARTNER_FIELD_LABELS),
      contacts: p.contacts ?? [],
      opportunities: p.opportunities ?? [],
      todos: p.todos ?? [],
      trainings: p.trainings ?? [],
      solutions: p.solutions ?? [],
    },
  };
}

// ============ 应用 Intake 提案（人工确认后写库） ============

const VALID_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];

export async function applyIntake(opts: {
  scope: IntakeScope;
  partnerId?: string;
  proposal: IntakeProposal;
  userId: string;
  sourceText?: string;
}): Promise<{ applied: string[]; partnerId: string }> {
  const { scope, proposal, userId } = opts;
  const applied: string[] = [];
  let partnerId = opts.partnerId ?? "";

  // ---- 新建伙伴 ----
  if (scope === "new_partner") {
    const name =
      proposal.partnerName ||
      proposal.fields.find((f) => f.field === "name")?.newValue ||
      "";
    if (!name.trim()) throw new Error("缺少公司名，无法建档");
    const data: Record<string, unknown> = { name: name.trim(), status: "PROSPECT", poolFlag: "NEW" };
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "fitScore" || f.field === "pipelineStage") {
        const n = parseInt(f.newValue, 10);
        if (!Number.isNaN(n)) data[f.field] = n;
      } else {
        data[f.field] = f.newValue;
      }
    }
    const created = await db.partner.create({ data: data as Prisma.PartnerCreateInput });
    partnerId = created.id;
    applied.push(`新建候选伙伴：${created.name}`);
    await db.timelineEvent.create({
      data: {
        partnerId,
        type: "SYSTEM",
        title: "AI 建档",
        content: proposal.summary || "由 AI 录入助手建档",
        createdById: userId,
        meta: JSON.stringify({ via: "ai-intake", sourceText: opts.sourceText?.slice(0, 8000) }),
      },
    });
  }

  if (!partnerId && scope !== "todo") throw new Error("缺少伙伴");

  // ---- 画像字段（非建档场景）----
  if (scope !== "new_partner" && proposal.fields.length) {
    const data: Record<string, unknown> = {};
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "fitScore" || f.field === "pipelineStage") {
        const n = parseInt(f.newValue, 10);
        if (!Number.isNaN(n)) data[f.field] = n;
      } else {
        data[f.field] = f.newValue;
      }
      applied.push(`字段「${f.label || PARTNER_FIELD_LABELS[f.field]}」→ ${f.newValue}`);
    }
    if (Object.keys(data).length) {
      await db.partner.update({ where: { id: partnerId }, data: data as Prisma.PartnerUpdateInput });
    }
  }

  // ---- 联系人 ----
  for (const c of proposal.contacts) {
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
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null));
    const existing =
      (c.action === "update" && c.id && (await db.contact.findFirst({ where: { id: c.id, partnerId } }))) ||
      (await db.contact.findFirst({ where: { partnerId, name: c.name } }));
    if (existing) {
      await db.contact.update({ where: { id: existing.id }, data: clean });
      applied.push(`更新联系人：${c.name}`);
    } else {
      await db.contact.create({ data: { partnerId, ...clean, name: c.name } });
      applied.push(`新增联系人：${c.name}`);
    }
  }

  // ---- 商机 ----
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
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null));
    const existing =
      (o.action === "update" && o.id && (await db.opportunity.findFirst({ where: { id: o.id, partnerId } }))) ||
      (await db.opportunity.findFirst({ where: { partnerId, name: o.name } }));
    if (existing) {
      await db.opportunity.update({ where: { id: existing.id }, data: clean });
      applied.push(`更新商机：${o.name}`);
    } else {
      await db.opportunity.create({ data: { partnerId, ...clean, name: o.name } });
      applied.push(`新增商机：${o.name}`);
    }
  }

  // ---- 培训 ----
  for (const t of proposal.trainings) {
    if (!t.person?.trim()) continue;
    await db.training.create({
      data: {
        partnerId,
        person: t.person,
        currentSkill: t.currentSkill,
        targetCert: t.targetCert,
        method: t.method,
        deadline: t.deadline ? new Date(t.deadline) : undefined,
        status: t.status && ["PLANNED", "IN_PROGRESS", "DONE"].includes(t.status) ? t.status : "PLANNED",
      },
    });
    applied.push(`新增培训：${t.person}${t.targetCert ? ` → ${t.targetCert}` : ""}`);
  }

  // ---- 联合方案 ----
  for (const s of proposal.solutions) {
    if (!s.name?.trim()) continue;
    await db.solution.create({
      data: {
        partnerId,
        name: s.name,
        targetCustomer: s.targetCustomer,
        painPoint: s.painPoint,
        fanruanOffer: s.fanruanOffer,
        partnerOffer: s.partnerOffer,
        pricingModel: s.pricingModel,
        status: s.status && s.status in SOLUTION_STATUS_LABELS ? s.status : "DRAFT",
        notes: s.notes,
      },
    });
    applied.push(`新增联合方案：${s.name}`);
  }

  // ---- 待办 ----
  for (const t of proposal.todos) {
    await db.todoItem.create({
      data: {
        title: t.title,
        detail: t.detail,
        partnerId: partnerId || null,
        assigneeId: userId,
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        priority: t.priority && ["HIGH", "MEDIUM", "LOW"].includes(t.priority) ? t.priority : "MEDIUM",
        source: "AI",
      },
    });
    applied.push(`新增待办：${t.title}`);
  }

  // ---- 时间线审计（非建档场景；建档已写）----
  if (scope !== "new_partner" && partnerId) {
    await db.timelineEvent.create({
      data: {
        partnerId,
        type: "AI_SUMMARY",
        title: `AI 录入：${SCOPE_CONFIG[scope].title}`,
        content: proposal.summary || applied.join("；"),
        createdById: userId,
        meta: JSON.stringify({ via: "ai-intake", scope, applied, sourceText: opts.sourceText?.slice(0, 8000) }),
      },
    });
  }

  return { applied, partnerId };
}
