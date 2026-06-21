import { AIError, chatJsonStream } from "./ai";
import { emitPhase, emitReplyChunks, nextTraceId, type TraceEmitter } from "./ai-trace";
import { clarificationSchemaHint, hasRequiredClarifications, normalizeAiClarifications } from "./ai-clarifications";
import { db } from "./db";
import type { Locale } from "./i18n/locale";
import { resolveAgentSkills } from "./skill-resolver";

import type {
  AgentBuilderClarification,
  AgentBuilderDraft,
  AgentBuilderMessage,
  AgentBuilderTurn,
  AgentDeliveryMode,
} from "./agent-builder-types";
export type {
  AgentBuilderClarification,
  AgentBuilderDraft,
  AgentBuilderMessage,
  AgentBuilderTurn,
  AgentDeliveryMode,
} from "./agent-builder-types";

const DEFAULT_DRAFT: AgentBuilderDraft = {
  name: "",
  icon: "🤖",
  description: "",
  instructions: "",
  skills: [],
  skillIds: [],
  trigger: "MANUAL",
  frequency: "WEEKLY",
  runHour: 9,
  runWeekday: 1,
  scopeType: "ALL",
  partnerId: "",
  shared: true,
  webhookUrl: "",
  deliveryMode: "",
  missingSkillNotes: [],
  questionnaire: [],
  rationale: "",
};

const VALID_DELIVERY: AgentDeliveryMode[] = ["inbox", "wecom_chat", "partner_group", "webhook"];

type AgentBuilderAiIntent = {
  goal?: string;
  trigger?: "MANUAL" | "SCHEDULE";
  frequency?: "HOURLY" | "DAILY" | "WEEKLY";
  runHour?: number;
  runWeekday?: number;
  partnerScope?: "all" | "named" | "bound";
  partnerNameHint?: string;
  deliveryMode?: AgentDeliveryMode | "unset";
  toolHints?: string[];
  skillIdHints?: string[];
};

function outputSchema(locale: Locale) {
  const replyLang = locale === "zh" ? "Chinese" : "English";
  return `Output exactly one JSON object. User-visible text in ${replyLang}; draft.skills/skillIds stay English identifiers.
{
  "reply": "${replyLang} concise reply (1-2 sentences)",
  "clarifications": [],
  "ready": true/false,
  "intent": {
    "goal": "${replyLang} one-line business goal",
    "trigger": "MANUAL|SCHEDULE",
    "frequency": "HOURLY|DAILY|WEEKLY",
    "runHour": 9,
    "runWeekday": 1,
    "partnerScope": "all|named|bound",
    "partnerNameHint": "when named — substring, NOT id",
    "deliveryMode": "inbox|wecom_chat|partner_group|webhook|unset",
    "toolHints": ["list_todos"],
    "skillIdHints": []
  },
  "draft": {
    "name": "${replyLang} Agent name",
    "icon": "one emoji",
    "description": "same as intent.goal",
    "instructions": "${replyLang} run steps, tool order, output format (concise)",
    "skills": [],
    "skillIds": [],
    "trigger": "MANUAL|SCHEDULE",
    "frequency": "DAILY|WEEKLY",
    "runHour": 9,
    "runWeekday": 1,
    "scopeType": "ALL|PARTNER",
    "partnerId": "",
    "webhookUrl": "",
    "deliveryMode": "",
    "missingSkillNotes": [],
    "rationale": "${replyLang} brief"
  }
}
Do NOT fill partnerId — server resolves from intent + DB.
Do NOT emit clarifications for partner list or delivery channel when intent is clear — server UI handles.
Only clarifications[] when business goal itself is ambiguous (max 1).`;
}

function buildRuntimeContextBlock(
  locale: Locale,
  ctx: {
    toolNames: string[];
    skillIds: string[];
    partnerCount: number;
    knowledgeCount: number;
    boundPartnerName?: string;
    boundPartnerId?: string;
  }
): string {
  const tools = ctx.toolNames.join(", ");
  const skills = ctx.skillIds.length ? ctx.skillIds.join(", ") : locale === "zh" ? "（暂无自定义技能）" : "(no custom skills)";
  if (locale === "zh") {
    return `【服务端上下文 — 输出 intent 参数，勿注入完整列表】
- 可用工具 (${ctx.toolNames.length}): ${tools}
- 自定义技能 id (${ctx.skillIds.length}): ${skills}
- 非归档伙伴: ${ctx.partnerCount}（partnerScope=all=全部; named=填 partnerNameHint; bound=绑定伙伴）
- 绑定伙伴: ${ctx.boundPartnerName ? `${ctx.boundPartnerName} (${ctx.boundPartnerId})` : "无"}
- 共享知识库条目: ${ctx.knowledgeCount}（instructions 中引用 search_knowledge 即可，勿列举标题）
- 交付方式/伙伴选择: 服务端 UI，AI 勿追问`;
  }
  return `【Server context — output intent params; do NOT list full catalogs】
- Tools (${ctx.toolNames.length}): ${tools}
- Custom skill ids (${ctx.skillIds.length}): ${skills}
- Active partners: ${ctx.partnerCount} (all|named|bound)
- Bound partner: ${ctx.boundPartnerName ?? "none"}
- Shared knowledge articles: ${ctx.knowledgeCount} (use search_knowledge in instructions; do not list titles)
- Delivery/partner pickers: server UI — do NOT ask in clarifications`;
}

function buildSystemPrompt(locale: Locale, ctxBlock: string) {
  const lang = locale === "zh" ? "Chinese (简体中文)" : "English";
  return `You are the conversational Agent Architect in Fanruan Partner Hub.
Parse user intent → JSON with intent.* semantic fields. Server resolves partnerId and validates tools/skills.

Language: ${lang}. reply, draft.name/description/instructions/rationale in ${lang}.

Examples:
- 「每周一汇总所有伙伴逾期待办发到收件箱」→ trigger=SCHEDULE, frequency=WEEKLY, runWeekday=1, partnerScope=all, deliveryMode=inbox, toolHints=[list_todos]
- 「帮我盯这个客户的商机变化，推送到本群」→ partnerScope=bound, deliveryMode=wecom_chat, toolHints=[list_opportunities]

Rules:
1. Pick tools from available list (intent.toolHints → draft.skills); prefer fewer precise tools.
2. intent.skillIdHints → draft.skillIds when methodology skills fit.
3. deliveryMode: inbox=收件箱; wecom_chat=当前企微群; partner_group=伙伴绑定群(需 PARTNER); webhook=外部URL.
4. ready=true when intent.goal, draft.instructions, deliveryMode≠unset; webhook needs draft.webhookUrl; no tier:"required" clarifications.
5. NEVER claim Agent is saved — user must confirm to persist.

${clarificationSchemaHint(locale)}

${ctxBlock}

${outputSchema(locale)}`;
}

function clampHour(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 9;
}

function clampWeekday(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 1;
}

function normalizeDeliveryMode(value: unknown): AgentDeliveryMode | "" {
  const s = String(value ?? "").trim() as AgentDeliveryMode;
  return VALID_DELIVERY.includes(s) ? s : "";
}

function isDraftReady(draft: AgentBuilderDraft): boolean {
  if (!draft.name.trim() || !draft.instructions.trim()) return false;
  if (!draft.deliveryMode) return false;
  if (draft.deliveryMode === "webhook" && !draft.webhookUrl.trim()) return false;
  if (draft.deliveryMode === "partner_group" && draft.scopeType !== "PARTNER") return false;
  if (draft.scopeType === "PARTNER" && !draft.partnerId) return false;
  return true;
}

function legacyQuestionOptions(locale: Locale): string[] {
  return locale === "zh"
    ? ["采用当前草案中的设置（推荐）", "需要换成另一种方式", "我还不确定"]
    : ["Use the draft's current setting (recommended)", "Prefer a different approach", "Not sure yet"];
}

function normalizeClarifications(raw: unknown, questions: string[], locale: Locale): AgentBuilderClarification[] {
  const out = normalizeAiClarifications(raw, { max: 4, defaultTier: "required" });
  if (out.length) return out;
  const qs = questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 4);
  return qs.map((question, i) => ({
    id: `legacy-${i}`,
    question,
    options: legacyQuestionOptions(locale),
  }));
}

function applySemanticIntentFromAi(
  draft: AgentBuilderDraft,
  intent: AgentBuilderAiIntent | undefined,
  rawDraft: Partial<AgentBuilderDraft>,
  opts: {
    partners: { id: string; name: string }[];
    boundPartnerId?: string;
    builtinNames: Set<string>;
    promptSkillIds: Set<string>;
  }
): AgentBuilderDraft {
  const goal = intent?.goal?.trim() || rawDraft.description?.trim() || draft.description;
  const trigger = intent?.trigger === "SCHEDULE" || rawDraft.trigger === "SCHEDULE" ? "SCHEDULE" : "MANUAL";
  const frequency = (["HOURLY", "DAILY", "WEEKLY"].includes(intent?.frequency ?? "")
    ? intent!.frequency
    : rawDraft.frequency) as AgentBuilderDraft["frequency"];
  const runHour = intent?.runHour != null ? clampHour(intent.runHour) : clampHour(rawDraft.runHour);
  const runWeekday = intent?.runWeekday != null ? clampWeekday(intent.runWeekday) : clampWeekday(rawDraft.runWeekday);

  let partnerId = draft.partnerId;
  let scopeType: AgentBuilderDraft["scopeType"] = "ALL";
  const scope = intent?.partnerScope;
  if (scope === "all") {
    partnerId = "";
    scopeType = "ALL";
  } else if (scope === "bound" && opts.boundPartnerId) {
    partnerId = opts.boundPartnerId;
    scopeType = "PARTNER";
  } else if (scope === "named" && intent?.partnerNameHint?.trim()) {
    const hint = intent.partnerNameHint.trim().toLowerCase();
    const p = opts.partners.find(
      (x) => x.name.toLowerCase().includes(hint) || hint.includes(x.name.toLowerCase())
    );
    if (p) {
      partnerId = p.id;
      scopeType = "PARTNER";
    }
  } else if (rawDraft.scopeType === "PARTNER" && opts.partners.some((p) => p.id === rawDraft.partnerId)) {
    partnerId = String(rawDraft.partnerId);
    scopeType = "PARTNER";
  }

  const toolHints = Array.isArray(intent?.toolHints) ? intent!.toolHints! : [];
  const draftSkills = Array.isArray(rawDraft.skills) ? rawDraft.skills : draft.skills;
  const skills = [...new Set([...toolHints, ...draftSkills])]
    .map((s) => String(s).trim())
    .filter((s) => opts.builtinNames.has(s));

  const skillHints = Array.isArray(intent?.skillIdHints) ? intent!.skillIdHints! : [];
  const draftSkillIds = Array.isArray(rawDraft.skillIds) ? rawDraft.skillIds : draft.skillIds;
  const skillIds = [...new Set([...skillHints, ...draftSkillIds])]
    .map((s) => String(s).trim())
    .filter((s) => opts.promptSkillIds.has(s));

  let deliveryMode = normalizeDeliveryMode(rawDraft.deliveryMode);
  if (intent?.deliveryMode && intent.deliveryMode !== "unset") {
    deliveryMode = normalizeDeliveryMode(intent.deliveryMode);
  }

  return {
    ...draft,
    description: goal,
    trigger,
    frequency: (["HOURLY", "DAILY", "WEEKLY"].includes(frequency ?? "") ? frequency : "WEEKLY") as AgentBuilderDraft["frequency"],
    runHour,
    runWeekday,
    scopeType,
    partnerId: scopeType === "PARTNER" ? partnerId : "",
    skills,
    skillIds,
    deliveryMode,
  };
}

function fallbackTurn(locale: Locale, detail: string, partial?: Partial<AgentBuilderTurn>): AgentBuilderTurn {
  const draft = { ...DEFAULT_DRAFT, ...(partial?.draft ?? {}) } as AgentBuilderDraft;
  const reply =
    locale === "zh"
      ? `抱歉，AI 返回格式有误，没能完整解析草案。请继续补充需求，或简化描述后重试。\n\n（${detail.slice(0, 120)}）`
      : `Sorry — the AI response had a format error. Please add more detail or retry.\n\n(${detail.slice(0, 120)})`;
  const questions = Array.isArray(partial?.questions) ? partial!.questions! : [];
  return {
    reply: partial?.reply?.trim() || reply,
    questions,
    clarifications: normalizeClarifications(partial?.clarifications, questions, locale),
    ready: false,
    draft,
  };
}

function normalizeTurn(
  raw: Partial<AgentBuilderTurn>,
  locale: Locale,
  builtinNames: Set<string>,
  promptSkillIds: Set<string>,
  partnerIds: Set<string>
): AgentBuilderTurn {
  const draft = { ...DEFAULT_DRAFT, ...(raw.draft ?? {}) } as AgentBuilderDraft;
  const skills = Array.isArray(draft.skills) ? draft.skills.filter((s) => builtinNames.has(s)) : [];
  const skillIds = Array.isArray(draft.skillIds) ? draft.skillIds.filter((id) => promptSkillIds.has(id)) : [];
  const scopeType = draft.scopeType === "PARTNER" && partnerIds.has(draft.partnerId) ? "PARTNER" : "ALL";
  const deliveryMode = normalizeDeliveryMode(draft.deliveryMode);
  const normalizedDraft: AgentBuilderDraft = {
    ...draft,
    icon: draft.icon || "🤖",
    skills,
    skillIds,
    trigger: draft.trigger === "SCHEDULE" ? "SCHEDULE" : "MANUAL",
    frequency: (["HOURLY", "DAILY", "WEEKLY"].includes(draft.frequency) ? draft.frequency : "WEEKLY") as AgentBuilderDraft["frequency"],
    runHour: clampHour(draft.runHour),
    runWeekday: clampWeekday(draft.runWeekday),
    scopeType: scopeType as AgentBuilderDraft["scopeType"],
    partnerId: scopeType === "PARTNER" ? draft.partnerId : "",
    shared: draft.shared !== false,
    webhookUrl: draft.webhookUrl || "",
    deliveryMode,
    missingSkillNotes: Array.isArray(draft.missingSkillNotes) ? draft.missingSkillNotes : [],
    questionnaire: Array.isArray(draft.questionnaire) ? draft.questionnaire : [],
    rationale: draft.rationale || "",
  };
  const defaultReply =
    locale === "zh" ? "我已整理 Agent 草案，请确认或补充信息。" : "I've drafted an Agent outline — please confirm what else to add.";
  const clarifications = normalizeClarifications(raw.clarifications, Array.isArray(raw.questions) ? raw.questions : [], locale);
  const questions =
    clarifications.length > 0
      ? clarifications.map((c) => c.question)
      : Array.isArray(raw.questions)
        ? raw.questions
        : [];
  return {
    reply: raw.reply?.trim() || defaultReply,
    questions,
    clarifications,
    ready: !!raw.ready && isDraftReady(normalizedDraft) && !hasRequiredClarifications(clarifications),
    draft: normalizedDraft,
  };
}

export async function runAgentBuilderTurn(opts: {
  messages: AgentBuilderMessage[];
  userId?: string;
  emit?: TraceEmitter;
  locale?: Locale;
  boundPartnerId?: string;
  boundPartnerName?: string;
}): Promise<AgentBuilderTurn> {
  const locale = opts.locale ?? "en";

  const [{ toolOptions, promptSkillOptions }, partnerCount, knowledgeCount, partners] = await Promise.all([
    resolveAgentSkills(),
    db.partner.count({ where: { status: { not: "ARCHIVED" } } }),
    db.knowledgeArticle.count({ where: { shared: true } }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  const builtinNames = new Set(toolOptions.map((t) => t.name));
  const promptSkillIds = new Set(promptSkillOptions.map((s) => s.id));
  const partnerIds = new Set(partners.map((p) => p.id));

  const ctxBlock = buildRuntimeContextBlock(locale, {
    toolNames: toolOptions.map((t) => t.name),
    skillIds: promptSkillOptions.map((s) => s.id),
    partnerCount,
    knowledgeCount,
    boundPartnerName: opts.boundPartnerName,
    boundPartnerId: opts.boundPartnerId,
  });

  const system = buildSystemPrompt(locale, ctxBlock);
  const conversation = opts.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const userPrompt =
    locale === "zh"
      ? `对话历史：\n${conversation || "用户尚未描述需求，请引导其说明想构建的 Agent。"}\n\n请输出 JSON（含 intent 语义参数，勿填 partnerId）。`
      : `Conversation:\n${conversation || "User has not described a need yet. Guide them on what Agent they want to build."}\n\nOutput JSON with intent params (no partnerId).`;

  const emit = opts.emit;
  const reasonId = nextTraceId("reason");
  emit?.({
    event: "trace",
    step: {
      type: "reasoning",
      id: reasonId,
      content: locale === "zh" ? "理解 Agent 需求…" : "Planning Agent configuration…",
      status: "running",
    },
  });
  emitPhase(emit, "extract", locale === "zh" ? "生成 Agent 草案" : "Building Agent draft");

  try {
    const { data: raw } = await chatJsonStream<{
      reply?: string;
      intent?: AgentBuilderAiIntent;
      draft?: Partial<AgentBuilderDraft>;
      clarifications?: unknown;
      questions?: string[];
      ready?: boolean;
    }>(system, userPrompt, {
      feature: "agent-builder",
      userId: opts.userId,
      temperature: 0.2,
      taskTier: "fast",
      maxTokens: 1200,
      emit,
    });

    let turn = normalizeTurn(raw as Partial<AgentBuilderTurn>, locale, builtinNames, promptSkillIds, partnerIds);
    const baseDraft = { ...DEFAULT_DRAFT, ...(raw.draft ?? {}) } as AgentBuilderDraft;
    const semanticDraft = applySemanticIntentFromAi(baseDraft, raw.intent, raw.draft ?? {}, {
      partners,
      boundPartnerId: opts.boundPartnerId,
      builtinNames,
      promptSkillIds,
    });
    const mergedRaw = { ...raw, draft: semanticDraft } as Partial<AgentBuilderTurn>;
    const mergedDraft = normalizeTurn(mergedRaw, locale, builtinNames, promptSkillIds, partnerIds).draft;
    turn = {
      ...turn,
      draft: mergedDraft,
      ready: !!raw.ready && isDraftReady(mergedDraft) && !hasRequiredClarifications(turn.clarifications),
    };

    emit?.({
      event: "trace_patch",
      id: reasonId,
      patch: {
        status: "done",
        content:
          locale === "zh"
            ? `草案：${turn.draft.name || "未命名"} · 工具 ${turn.draft.skills.length} 个`
            : `Draft: ${turn.draft.name || "Untitled"} · ${turn.draft.skills.length} tool(s)`,
      },
    });
    emitPhase(emit, "reply", locale === "zh" ? "生成回复" : "Generating reply");
    const reply = raw.reply?.trim() || turn.reply;
    if (reply) await emitReplyChunks(emit, reply);
    return { ...turn, reply };
  } catch (e) {
    emit?.({ event: "trace_patch", id: reasonId, patch: { status: "done" } });
    const detail = e instanceof AIError ? e.message : e instanceof Error ? e.message : String(e);
    return fallbackTurn(locale, detail);
  }
}

export { isDraftReady, normalizeDeliveryMode };
