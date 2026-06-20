import { AIError, chatJson } from "./ai";
import { emitReplyChunks, type TraceEmitter } from "./ai-trace";
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

function outputSchema(locale: Locale) {
  const replyLang = locale === "zh" ? "Chinese" : "English";
  return `Output exactly one JSON object:
{
  "reply": "${replyLang} reply to the user; concise product-consultant tone explaining current understanding and next step",
  "clarifications": [
    {
      "id": "stable_snake_id e.g. delivery_mode",
      "question": "One-line confirmation question",
      "options": ["2-4 concrete choices; FIRST option is your recommended default for this Agent"]
    }
  ],
  "questions": ["Deprecated — mirror clarification questions as plain strings for legacy clients; prefer clarifications"],
  "ready": true/false,
  "draft": {
    "name": "Agent name",
    "icon": "one emoji",
    "description": "one-line description",
    "instructions": "Full system instructions: identity, run steps each time, tool order, output format, how to proceed when a tool is missing using existing data and reasoning",
    "skills": ["tool name, e.g. list_todos"],
    "skillIds": ["skill id"],
    "trigger": "MANUAL or SCHEDULE",
    "frequency": "HOURLY/DAILY/WEEKLY",
    "runHour": 0-23,
    "runWeekday": 1-7,
    "scopeType": "ALL or PARTNER",
    "partnerId": "bound partner id or empty string",
    "shared": true,
    "webhookUrl": "required when deliveryMode=webhook, else empty",
    "deliveryMode": "inbox | wecom_chat | partner_group | webhook",
    "missingSkillNotes": ["When no matching skill exists, explain gap and interim approach"],
    "questionnaire": ["Survey-style questions for user confirmation"],
    "rationale": "Why these tools/skills, trigger, and delivery mode were chosen"
  }
}`;
}

function buildSystemPrompt(locale: Locale, toolLines: string, promptSkillLines: string, partnerLines: string, knowledgeLines: string) {
  const lang = locale === "zh" ? "Chinese" : "English";
  return `You are the conversational "Agent Architect" in the AI Agent platform.
Goal: help users build runnable Agents through dialogue, not by making them understand every form field.
Always reply in ${lang}.

How you work:
1. Understand business goal, inputs, trigger timing, deliverables, delivery channel, risk boundaries.
2. When info is insufficient, output clarifications[] (max 4): each item is one confirmation with 2-4 options. Put your recommended choice FIRST in options. Do NOT include "Other" — the UI adds it. Avoid open-ended questions in reply; use clarifications instead.
3. Pick tools from the tool list (draft.skills) and methodology skills (draft.skillIds); prefer fewer, precise choices.
4. If no skill fits exactly, don't block; note the gap in missingSkillNotes and write interim steps in instructions.
5. For company strategy/product knowledge, prefer search_knowledge in instructions.
6. Partner profile field edits should go through proposals/human approval; timeline writes, todos, and document creation can be direct actions.
7. Before ready=true you MUST have confirmed ALL of:
   - Business goal and instructions
   - Trigger (MANUAL or SCHEDULE + frequency/runHour if scheduled)
   - Scope (ALL or PARTNER + partnerId if partner-bound)
   - Delivery mode (draft.deliveryMode):
     * inbox — results only in Partner Hub inbox
     * wecom_chat — push to the WeCom chat where the user is building (use when user says current group / 本群 / 这个群)
     * partner_group — push to partner's bound WeCom group (requires scopeType=PARTNER)
     * webhook — external webhook URL in draft.webhookUrl
8. ready=true only when name, instructions, deliveryMode are set; webhook mode also requires webhookUrl.
9. NEVER claim the Agent is already saved/created in the system. When ready=true, say the draft is ready and the user must reply 确认 or 创建Agent in WeCom to persist it.

【Available tools (draft.skills = name)】
${toolLines}

【Available skills (draft.skillIds = id)】
${promptSkillLines}

【Bindable partners】
${partnerLines || "(no partners yet)"}

【Citable knowledge base】
${knowledgeLines}

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
    ? ["采用当前草案设置（推荐）", "需要换成另一种方式", "暂不确定"]
    : ["Use draft setting (recommended)", "Prefer a different approach", "Not sure yet"];
}

function normalizeClarifications(raw: unknown, questions: string[], locale: Locale): AgentBuilderClarification[] {
  const out: AgentBuilderClarification[] = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length && out.length < 4; i++) {
      const c = raw[i] as Partial<AgentBuilderClarification> | null;
      if (!c || typeof c.question !== "string") continue;
      const options = Array.isArray(c.options)
        ? c.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 5)
        : [];
      if (!options.length) continue;
      out.push({
        id: typeof c.id === "string" && c.id.trim() ? c.id.trim() : `confirm-${i}`,
        question: c.question.trim(),
        options,
      });
    }
  }
  if (out.length) return out;
  const qs = questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 4);
  return qs.map((question, i) => ({
    id: `legacy-${i}`,
    question,
    options: legacyQuestionOptions(locale),
  }));
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
    ready: !!raw.ready && isDraftReady(normalizedDraft) && clarifications.length === 0,
    draft: normalizedDraft,
  };
}

export async function runAgentBuilderTurn(opts: {
  messages: AgentBuilderMessage[];
  userId?: string;
  emit?: TraceEmitter;
  locale?: Locale;
}): Promise<AgentBuilderTurn> {
  const locale = opts.locale ?? "en";
  const [{ toolOptions, promptSkillOptions }, partners, knowledge] = await Promise.all([
    resolveAgentSkills(),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true, status: true, tier: true, country: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
    db.knowledgeArticle.findMany({
      where: { shared: true },
      select: { title: true, category: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const builtinNames = new Set(toolOptions.map((t) => t.name));
  const promptSkillIds = new Set(promptSkillOptions.map((s) => s.id));
  const partnerIds = new Set(partners.map((p) => p.id));

  const toolLines = toolOptions.map((t) => `TOOL name=${t.name} | ${t.label} | ${t.desc}`).join("\n");
  const promptSkillLines = promptSkillOptions.map((s) => `SKILL id=${s.id} | ${s.label} | ${s.desc}`).join("\n") || "(no custom skills yet)";
  const partnerLines = partners
    .map((p) => `${p.id} | ${p.name} | ${p.status}${p.tier ? ` | Tier ${p.tier}` : ""}${p.country ? ` | ${p.country}` : ""}`)
    .join("\n");
  const knowledgeLines = knowledge.map((k) => `${k.category} | ${k.title}`).join("\n") || "(no shared knowledge yet)";

  const system = buildSystemPrompt(locale, toolLines, promptSkillLines, partnerLines, knowledgeLines);
  const conversation = opts.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const userPrompt =
    locale === "zh"
      ? `【当前对话】\n${conversation || "用户尚未描述需求，请引导其说明想构建的 Agent。"}`
      : `【Current conversation】\n${conversation || "User has not described a need yet. Guide them on what Agent they want to build."}`;

  let raw: Partial<AgentBuilderTurn>;
  try {
    raw = await chatJson<Partial<AgentBuilderTurn>>(system, userPrompt, {
      feature: locale === "zh" ? "企微 Agent Builder" : "Conversational Agent builder",
      userId: opts.userId,
      temperature: 0.2,
    });
  } catch (e) {
    const detail = e instanceof AIError ? e.message : e instanceof Error ? e.message : String(e);
    return fallbackTurn(locale, detail);
  }

  const turn = normalizeTurn(raw, locale, builtinNames, promptSkillIds, partnerIds);
  await emitReplyChunks(opts.emit, turn.reply);
  return turn;
}

export { isDraftReady, normalizeDeliveryMode };
