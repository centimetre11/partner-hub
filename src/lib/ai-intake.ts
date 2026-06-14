import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { chatCompletion, parseJsonLoose, type ChatMessage, type ToolCall } from "./ai";
import { runToolLoop } from "./ai-tool-loop";
import { nextTraceId, emitReplyChunks, emitProposalUpdate, emitProposalPatch, emitPhase, type TraceEmitter } from "./ai-trace";
import { extractPatchFromTool } from "./proposal-patch-extract";
import {
  buildIntakeTools,
  intakeEnrichmentSkillsForScope,
  newSkillContext,
  runSkill,
} from "./skills";
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
      "用户想新建一个候选伙伴。输入可能是：仅公司名、会议/聊天长文、公司介绍、或帆软 KMS 链接（KMS 与联网/领英等调研应叠加使用，目标是把档案尽量补全）。",
    guide: `建档至少要有：公司名（partnerName，必填）。尽量补全：category、country/city、headcount、website、coreBusiness、capability、knownClients、currentTools、certLevel、keyDifferentiator、playbook、fitScore、priority。缺关键项时可友好追问 1-2 点，但应先主动调研（见下方工具说明）。`,
    schemaHint: `partnerName 填公司名；fields 填其余画像字段（字段名只能用：${FIELD_LIST}，category 取值：${CATEGORY_LIST}，pipelineStage 取 1-10：${STAGE_LIST}）；如文中或调研提到人物则填 contacts，提到商机则填 opportunities。trainings/solutions 留空数组。`,
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
    intro: "用户想补全/更新这个伙伴的画像字段。可能附带 KMS 链接或仅有零散描述，需结合现有档案与工具调研补全。",
    guide: `把用户描述与调研结果映射到画像字段。字段名只能用：${FIELD_LIST}（category 取值：${CATEGORY_LIST}）。信息不足时先用工具调研再填。`,
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
- 只提取有依据的内容：用户原文、工具返回的公开/内部信息均可；reason 标注来源（用户原文/KMS/web_search/LinkedIn/search_knowledge 等）。不要编造工具未返回的内容。
- ready 判断：核心必填项齐了就为 true（建议补全项缺失只做软提示，不要因此把 ready 设为 false）。用户明确说"就这些/直接录入/不知道了"时 ready 必须为 true。
- proposal 要带上目前已确认的全部内容（累加，不要每轮清空之前已抽取的）。`;

const RESEARCH_GUIDE = `【主动调研（重要）】
目标：把建档所需信息尽量补全。各类输入（仅公司名、长文、KMS 链接、聊天记录）都要走「多源叠加」，不要只做一种调研就停。
在输出 JSON 提案前，按下面策略组合使用工具（可并行、可多次调用）：

1. 用户给了 KMS 链接/pageId → 先 read_kms；读完仍要对文档里出现的公司名做 web_search + linkedin_search，补官网、规模、客户、关键人等 KMS 里没有的公开信息
2. 从用户原文/KMS 中识别出公司名后 → search_partners 查重；web_search 查背景；linkedin_search 查高管/关键联系人
3. 画像字段仍缺 category/playbook/帆软切入角度 → search_knowledge 检索团队知识库
4. 每轮工具返回后对照建档字段清单，缺什么继续查，直到主要字段有依据或公开渠道确实查不到
5. 工具失败或未配置（如无 KMS 令牌）时跳过该项，换其他工具继续，不要阻塞建档
6. 调研完成后必须输出 JSON 提案（不要再调用工具）；reply 里用 1-2 句说明各来源查到了什么、还缺什么`;

const MAX_RESEARCH_STEPS = 8;

function normalizeIntakeTurn(raw: Partial<IntakeTurn>): IntakeTurn {
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

async function extractIntakeJson(
  chat: ChatMessage[],
  feature: string,
  userId?: string,
  emit?: TraceEmitter
): Promise<IntakeTurn> {
  const extractId = nextTraceId("extract");
  emitPhase(emit, "extract", "整理提案");
  emit?.({
    event: "trace",
    step: {
      type: "reasoning",
      id: extractId,
      content: "正在整理可入库提案…",
      status: "running",
    },
  });
  const extractChat = [...chat, { role: "user" as const, content: "请根据以上对话与调研结果，输出最终 JSON 提案（严格按 OUTPUT_SCHEMA，只输出 JSON）。" }];
  let content: string | null;
  try {
    ({ content } = await chatCompletion(extractChat, {
      jsonMode: true,
      temperature: 0.3,
      feature,
      userId,
    }));
  } catch {
    extractChat[0].content = (extractChat[0].content ?? "") + "\n\n务必只输出一个合法 JSON 对象。";
    ({ content } = await chatCompletion(extractChat, {
      temperature: 0.3,
      feature,
      userId,
    }));
  }
  const turn = normalizeIntakeTurn(parseJsonLoose<Partial<IntakeTurn>>(content ?? ""));
  emit?.({
    event: "trace_patch",
    id: extractId,
    patch: { status: "done", content: "提案整理完成" },
  });
  emitPhase(emit, "reply");
  emitProposalUpdate(emit, turn);
  await emitReplyChunks(emit, turn.reply);
  return turn;
}

async function runIntakeToolCall(tc: ToolCall, userId?: string): Promise<string> {
  if (tc.function.name === "$web_search") {
    return tc.function.arguments;
  }
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.function.arguments || "{}");
  } catch {
    /* ignore */
  }
  const ctx = newSkillContext({ mode: "assistant", userId: userId ?? null });
  return runSkill(tc.function.name, args, ctx);
}

export async function runIntakeTurn(opts: {
  scope: IntakeScope;
  partnerId?: string;
  messages: IntakeMessage[];
  today: string;
  userId?: string;
  emit?: TraceEmitter;
}): Promise<IntakeTurn> {
  const cfg = SCOPE_CONFIG[opts.scope];
  let ctx = "";
  if (opts.partnerId) {
    ctx = `\n\n【当前伙伴档案（用于判断新增/更新、解析汇报关系）】\n${await partnerContext(opts.partnerId)}`;
  }

  const enrichmentSkills = intakeEnrichmentSkillsForScope(opts.scope);
  const useResearch = enrichmentSkills.length > 0 && !!opts.userId;

  const system = `你是帆软软件（Fanruan，中国领先BI厂商，产品 FineReport/FineBI/FineDataLink）中东区伙伴管理系统的 AI 录入助手。
今天日期：${opts.today}。
当前任务：${cfg.title}。${cfg.intro}

【引导规则（重要，但不要死板）】
${cfg.guide}
追问要像同事聊天一样自然简短，别像填表。用户提供的信息已经够用时，就直接给出提案并把 ready 设为 true，不要为了凑齐字段反复追问。
${useResearch ? `\n${RESEARCH_GUIDE}` : ""}

【本次提案应填写的范围】
${cfg.schemaHint}
${ctx}

${OUTPUT_SCHEMA}`;

  const chat: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of opts.messages) chat.push({ role: m.role, content: m.content });

  const feature = `AI 录入助手：${cfg.title}`;

  if (useResearch) {
    const tools = await buildIntakeTools(enrichmentSkills);
    const planId = nextTraceId("plan");
    emitPhase(opts.emit, "research", "多源调研");
    opts.emit?.({
      event: "trace",
      step: {
        type: "reasoning",
        id: planId,
        content: "多源调研中…",
        status: "running",
      },
    });
    const researchContent = await runToolLoop({
      chat,
      tools,
      temperature: 0.3,
      feature,
      userId: opts.userId,
      maxSteps: MAX_RESEARCH_STEPS,
      emit: opts.emit,
      streamReply: false,
      onToolDone: (tc, result) => {
        void extractPatchFromTool(tc.function.name, result, opts.scope, opts.userId).then((ops) => {
          emitProposalPatch(opts.emit, ops);
        });
      },
      executeTool: (tc) => runIntakeToolCall(tc, opts.userId),
    });
    opts.emit?.({
      event: "trace_patch",
      id: planId,
      patch: { status: "done", content: "调研完成" },
    });
    if (researchContent?.trim().startsWith("{")) {
      try {
        const turn = normalizeIntakeTurn(parseJsonLoose<Partial<IntakeTurn>>(researchContent));
        emitProposalUpdate(opts.emit, turn);
        await emitReplyChunks(opts.emit, turn.reply);
        return turn;
      } catch {
        /* fall through */
      }
    }
    return extractIntakeJson(chat, feature, opts.userId, opts.emit);
  }

  emitPhase(opts.emit, "extract", "整理提案");
  let content: string | null;
  try {
    ({ content } = await chatCompletion(chat, {
      jsonMode: true,
      temperature: 0.3,
      feature,
      userId: opts.userId,
    }));
  } catch {
    chat[0].content += "\n\n务必只输出一个合法 JSON 对象。";
    ({ content } = await chatCompletion(chat, {
      temperature: 0.3,
      feature,
      userId: opts.userId,
    }));
  }
  const turn = normalizeIntakeTurn(parseJsonLoose<Partial<IntakeTurn>>(content ?? ""));
  emitProposalUpdate(opts.emit, turn);
  await emitReplyChunks(opts.emit, turn.reply);
  return turn;
}

/** 检测是否应走「提案确认」模式（KMS 建档 / 补全画像 / 提炼伙伴） */
export function shouldUseProposeMode(messages: IntakeMessage[]): boolean {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  if (/kms\.fineres\.com|pageId=\d+/i.test(text)) return true;
  if (/建档|补全画像|提炼.{0,6}伙伴|录入|创建伙伴|新公司|丰富.{0,4}档案|完善.{0,4}画像/i.test(text)) return true;
  return false;
}

export function detectProposeScope(messages: IntakeMessage[], partnerId?: string): IntakeScope {
  if (partnerId) return "profile";
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (/人物|联系人|权力地图|CTO|CEO/i.test(last)) return "powermap";
  if (/商机|opportunity/i.test(last)) return "opportunity";
  return "new_partner";
}

export type ProposeTurn = IntakeTurn & { scope: IntakeScope; mode: "propose" };

/** 助手 propose 模式：多源调研 + 结构化提案（确认后才写库） */
export async function runProposeTurn(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  userId?: string;
  emit?: TraceEmitter;
  scope?: IntakeScope;
}): Promise<ProposeTurn> {
  const scope = opts.scope ?? detectProposeScope(opts.messages, opts.partnerId);
  const turn = await runIntakeTurn({
    scope,
    partnerId: opts.partnerId,
    messages: opts.messages,
    today: new Date().toISOString().slice(0, 10),
    userId: opts.userId,
    emit: opts.emit,
  });
  return { ...turn, scope, mode: "propose" };
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
