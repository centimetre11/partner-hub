import { chatJson } from "./ai";
import { emitReplyChunks, type TraceEmitter } from "./ai-trace";
import { db } from "./db";
import { resolveAgentSkills } from "./skill-resolver";

export type AgentBuilderMessage = { role: "user" | "assistant"; content: string };

export type AgentBuilderDraft = {
  name: string;
  icon: string;
  description: string;
  instructions: string;
  skills: string[];
  skillIds: string[];
  trigger: "MANUAL" | "SCHEDULE";
  frequency: "HOURLY" | "DAILY" | "WEEKLY";
  runHour: number;
  runWeekday: number;
  scopeType: "ALL" | "PARTNER";
  partnerId: string;
  shared: boolean;
  webhookUrl: string;
  missingSkillNotes: string[];
  questionnaire: string[];
  rationale: string;
};

export type AgentBuilderTurn = {
  reply: string;
  questions: string[];
  ready: boolean;
  draft: AgentBuilderDraft;
};

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
  missingSkillNotes: [],
  questionnaire: [],
  rationale: "",
};

const OUTPUT_SCHEMA = `Output exactly one JSON object:
{
  "reply": "English reply to the user; concise product-consultant tone explaining current understanding and next step",
  "questions": ["Questions still needing user confirmation, max 5; empty array if enough info"],
  "ready": true/false,
  "draft": {
    "name": "Agent name",
    "icon": "one emoji",
    "description": "one-line description",
    "instructions": "Full system instructions: identity, run steps each time, tool order, output format, how to proceed when a tool is missing using existing data and reasoning",
    "skills": ["tool name, e.g. web_search"],
    "skillIds": ["skill id"],
    "trigger": "MANUAL or SCHEDULE",
    "frequency": "HOURLY/DAILY/WEEKLY",
    "runHour": 0-23,
    "runWeekday": 1-7,
    "scopeType": "ALL or PARTNER",
    "partnerId": "bound partner id or empty string",
    "shared": true,
    "webhookUrl": "",
    "missingSkillNotes": ["When no matching skill exists, explain gap and interim approach"],
    "questionnaire": ["Survey-style questions for user confirmation"],
    "rationale": "Why these tools/skills and trigger mode were chosen"
  }
}`;

function clampHour(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 9;
}

function clampWeekday(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 1;
}

export async function runAgentBuilderTurn(opts: {
  messages: AgentBuilderMessage[];
  userId?: string;
  emit?: TraceEmitter;
}): Promise<AgentBuilderTurn> {
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

  const system = `You are the conversational "Agent Architect" in the AI Agent platform (OpenClaw / Harness / Workbuddy style).
Goal: help users build runnable Agents through dialogue, not by making them understand every form field.
Always reply in English.

How you work:
1. Understand business goal, inputs, trigger timing, deliverables, write/push needs, risk boundaries.
2. When info is insufficient, ask the most critical clarifying questions in one survey-style batch — avoid fragmented back-and-forth.
3. Pick tools from the tool list (draft.skills) and methodology skills (draft.skillIds); prefer fewer, precise choices.
4. If no skill fits exactly, don't block; note the gap in missingSkillNotes and write interim steps in instructions: try linkedin_search, web_search, knowledge base, profiles, and reasoning first.
5. For company strategy/product knowledge, prefer search_knowledge and require checking the knowledge base in instructions.
6. Partner profile field edits should go through proposals/human approval; timeline writes, todos, and document creation can be direct actions.
7. ready=true only when the draft is sufficient to create; if goal/trigger/output/data source are still missing, ready=false with questionnaire.

【Available tools (draft.skills = name)】
${toolLines}

【Available skills (draft.skillIds = id)】
${promptSkillLines}

【Bindable partners】
${partnerLines || "(no partners yet)"}

【Citable knowledge base】
${knowledgeLines}

${OUTPUT_SCHEMA}`;

  const conversation = opts.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const raw = await chatJson<Partial<AgentBuilderTurn>>(
    system,
    `【Current conversation】\n${conversation || "User has not described a need yet. Guide them on what Agent they want to build."}`,
    { feature: "Conversational Agent builder", userId: opts.userId, temperature: 0.2 }
  );
  const draft = { ...DEFAULT_DRAFT, ...(raw.draft ?? {}) } as AgentBuilderDraft;
  const skills = Array.isArray(draft.skills) ? draft.skills.filter((s) => builtinNames.has(s)) : [];
  const skillIds = Array.isArray(draft.skillIds) ? draft.skillIds.filter((id) => promptSkillIds.has(id)) : [];
  const scopeType = draft.scopeType === "PARTNER" && partnerIds.has(draft.partnerId) ? "PARTNER" : "ALL";

  const turn: AgentBuilderTurn = {
    reply: raw.reply || "I've drafted an Agent outline — please confirm what else to add.",
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    ready: !!raw.ready && !!draft.name && !!draft.instructions,
    draft: {
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
      missingSkillNotes: Array.isArray(draft.missingSkillNotes) ? draft.missingSkillNotes : [],
      questionnaire: Array.isArray(draft.questionnaire) ? draft.questionnaire : [],
      rationale: draft.rationale || "",
    },
  };
  await emitReplyChunks(opts.emit, turn.reply);
  return turn;
}
