import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { chatCompletion, parseJsonLoose, type ChatMessage, type ToolCall } from "./ai";
import type { AiTaskTier } from "./ai-capabilities";
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
  INDUSTRY_LABELS,
  PARTNER_FIELD_LABELS,
  PIPELINE_STAGES,
  SOLUTION_STATUS_LABELS,
} from "./constants";
import { taxonomyListForAi, normalizeIndustriesInput } from "./taxonomy";
import { partnerContext, powermapContext, type ContactProposal, type FieldUpdate, type OpportunityProposal, type TodoProposal } from "./proposals";
import { ACTIVE_PARTNER_DEFAULTS, createStarterTodos } from "./partner-onboarding";

// ============ Intake scopes ============

export type IntakeScope =
  | "new_partner"
  | "powermap"
  | "opportunity"
  | "profile"
  | "training"
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

/** Structured clarification: selectable options when info is incomplete */
export type IntakeClarification = {
  id: string;
  question: string; // One-line clarification question
  options: string[]; // Options (user tap to fill back)
  multi?: boolean; // Allow multi-select
  allowOther?: boolean; // Allow "Other / manual entry"
};

export type IntakeTurn = {
  reply: string; // AI message to user (natural tone, may include follow-ups)
  questions: string[]; // Open clarification points (guidance)
  clarifications: IntakeClarification[]; // Structured option clarifications
  ready: boolean; // Whether info is sufficient to save
  proposal: IntakeProposal;
};

export type IntakeMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { url: string; name?: string }[];
};

function emptyProposal(): IntakeProposal {
  return { summary: "", fields: [], contacts: [], opportunities: [], todos: [], trainings: [], solutions: [] };
}

// ============ Per-scope prompt config ============

const FIELD_LIST = Object.entries(PARTNER_FIELD_LABELS)
  .map(([f, l]) => `${f}(${l})`)
  .join("、");

const CATEGORY_LIST = Object.entries(CATEGORY_LABELS)
  .map(([k, v]) => `${k}=${v}`)
  .join("，");

const INDUSTRY_LIST = Object.entries(INDUSTRY_LABELS)
  .map(([k, v]) => `${k}=${v}`)
  .join("，");

const STAGE_LIST = PIPELINE_STAGES.map((s) => `${s.stage}=${s.name}`).join("，");

const ROLE_LINE = "role: APPROVER/DECISION_MAKER/SUPPORTER/EVALUATOR/INFLUENCER";
const ATTITUDE_LINE = "attitude score: 3=champion (proactive)/2=supportive exclusive/1=supportive non-exclusive/0=neutral or not engaged/-1=opposed";

type ScopeConfig = {
  title: string;
  intro: string;
  guide: string; // Soft completion checklist
  schemaHint: string; // Which proposal keys to fill for this scope
};

const SCOPE_CONFIG: Record<IntakeScope, ScopeConfig> = {
  new_partner: {
    title: "New partner onboarding",
    intro:
      "The user wants to create a new prospect partner. Input may be: company name only, long meeting/chat text, company intro, or a Fanruan KMS link (combine KMS with web/LinkedIn research; goal is to fill the profile as completely as possible).",
    guide: `Minimum for onboarding: company name (partnerName, required). Try to fill: category, industry, country/city, headcount, website, coreBusiness, capability, knownClients, currentTools, certLevel, keyDifferentiator, playbook, fitScore, priority. If key items are missing, ask 1–2 friendly follow-ups, but research proactively first (see tool notes below).`,
    schemaHint: `Set partnerName to the company name; fill other profile fields in fields (field names only: ${FIELD_LIST}; category values: ${CATEGORY_LIST}; industry values: ${INDUSTRY_LIST}; pipelineStage 1–10: ${STAGE_LIST}); add contacts if people appear in text/research, opportunities if deals are mentioned. Leave trainings/solutions as empty arrays.`,
  },
  powermap: {
    title: "Add power map contact",
    intro:
      "The user wants to add or update people on this partner's power map. Extract person attributes directly from user text or images (business cards, meeting notes, org charts, chat screenshots). No web research needed.",
    guide: `Extract only what is supported by the material (text/image). Do not invent, guess, or search the web. For each person try to extract:
- name
- title, department
- ${ROLE_LINE}
- ${ATTITUDE_LINE}
- reportsToName (when reporting/line-of-command is clear; prefer names from existing contacts below)
Decide add (action=add) vs update (action=update with id) against the existing list. Leave unknown fields empty; don't over-ask. Only when reporting line is clearly missing, use one structured clarification: "Who does {name} report to?" with options = existing contact names + "Top level" + "Unknown".`,
    schemaHint:
      "Fill contacts only (action=add or update with id). Leave fields/opportunities/todos/trainings/solutions as empty arrays.",
  },
  opportunity: {
    title: "Add opportunity",
    intro: "The user wants to add or update an opportunity for this partner.",
    guide: "For each opportunity try: client, amount, stage, nextStep. Ask one question if key info is missing.",
    schemaHint: "Fill opportunities only. Leave others as empty arrays.",
  },
  profile: {
    title: "Complete partner profile",
    intro: "The user wants to fill or update profile fields. May include a KMS link or scattered notes; combine existing record with tool research.",
    guide: `Map user input and research to profile fields. Field names only: ${FIELD_LIST} (category: ${CATEGORY_LIST}; industry: ${INDUSTRY_LIST}). Use tools when info is insufficient.`,
    schemaHint: "Fill fields only (FieldUpdate; oldValue may be empty). Leave others as empty arrays.",
  },
  training: {
    title: "Add training plan",
    intro: "The user wants to schedule capability training/certification for this partner (e.g. FCA-FineBI, FCA-FineReport).",
    guide:
      "Per training try: person (required), currentSkill, targetCert, deadline (YYYY-MM-DD), status (PLANNED/IN_PROGRESS/DONE). Ask if person is missing.",
    schemaHint: "Fill trainings only. Leave others as empty arrays.",
  },
  solution: {
    title: "Add joint solution",
    intro: "The user wants to capture a co-created joint solution with this partner.",
    guide: `Per solution try: name (required), targetCustomer, painPoint, fanruanOffer, partnerOffer, pricingModel, status (${Object.keys(SOLUTION_STATUS_LABELS).join("/")}).`,
    schemaHint: "Fill solutions only. Leave others as empty arrays.",
  },
};

/** Lightweight intake scopes use the fast model (attribute extraction, no deep reasoning) */
function intakeTaskTier(scope: IntakeScope): AiTaskTier {
  switch (scope) {
    case "powermap":
    case "opportunity":
    case "training":
      return "fast";
    default:
      return "standard";
  }
}

// ============ Multi-turn extraction ============

const OUTPUT_SCHEMA = `Output a single JSON object only. Reply in English. Structure:
{
  "reply": "Your message to the user (English, natural tone; ask clarifications here, at most 1–2 key points)",
  "questions": ["clarification point 1", "..."],
  "clarifications": [
    { "id":"country", "question":"Which country is this company primarily in?", "options":["UAE","Saudi Arabia","Qatar","Egypt"], "multi":false, "allowOther":true }
  ],
  "ready": true/false,
  "proposal": {
    "partnerName": "(new_partner only: company name)",
    "summary": "One-line summary of what will be saved",
    "fields": [{"field":"...","label":"...","oldValue":"...","newValue":"...","reason":"source in text"}],
    "contacts": [{"action":"add|update","id":"(when update)","name":"...","role":"...","title":"...","department":"...","attitude":0,"reportsToName":"...","contactInfo":"...","reason":"..."}],
    "opportunities": [{"action":"add|update","id":"...","name":"...","client":"...","amount":"...","stage":"...","nextStep":"...","status":"...","reason":"..."}],
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","detail":"..."}],
    "trainings": [{"person":"...","currentSkill":"...","targetCert":"...","deadline":"YYYY-MM-DD","status":"PLANNED|IN_PROGRESS|DONE","reason":"..."}],
    "solutions": [{"name":"...","targetCustomer":"...","painPoint":"...","fanruanOffer":"...","partnerOffer":"...","pricingModel":"...","status":"...","reason":"..."}]
  }
}
Rules:
- Extract only supported content from user text or tool results; cite reason (user text/KMS/web_search/LinkedIn/search_knowledge). Do not invent beyond tools.
- ready: true when required fields are present (missing nice-to-haves = soft hint only, not ready=false). If user says "that's all / save now / don't know", ready must be true.
- proposal accumulates confirmed content each turn (do not clear prior extractions).
- clarifications: when key info is missing and you can enumerate options, give 1–3 multiple-choice items (id = English field name e.g. country/category/headcount; options = short English phrases).
- Do not ask about fields already confirmed. Empty clarifications array if none needed.`;

/** Power map intake: compact JSON schema to reduce prompt size */
const OUTPUT_SCHEMA_POWERMAP = `Output a single JSON object. Reply in English:
{
  "reply": "Your message to the user (English, brief)",
  "questions": [],
  "clarifications": [
    { "id":"reportsTo", "question":"Who does {name} report to?", "options":["existing contact name","Top level","Unknown"], "multi":false, "allowOther":true }
  ],
  "ready": true/false,
  "proposal": {
    "summary": "One-line summary of people identified",
    "fields": [],
    "contacts": [{"action":"add|update","id":"(when update)","name":"...","role":"APPROVER|DECISION_MAKER|SUPPORTER|EVALUATOR|INFLUENCER","title":"...","department":"...","attitude":0,"reportsToName":"...","contactInfo":"...","reason":"source in material"}],
    "opportunities": [],
    "todos": [],
    "trainings": [],
    "solutions": []
  }
}
Rules:
- Fill contacts only; keep fields/opportunities/todos/trainings/solutions as empty arrays.
- Extract only from material (text/image); cite reason; do not invent.
- Match [Existing contacts] for add vs update (update must include id).
- ready=true when core info is enough; use clarifications only for missing reporting lines.`;

function outputSchemaForScope(scope: IntakeScope): string {
  return scope === "powermap" ? OUTPUT_SCHEMA_POWERMAP : OUTPUT_SCHEMA;
}

async function partnerContextForScope(scope: IntakeScope, partnerId: string): Promise<string> {
  if (scope === "powermap") return powermapContext(partnerId);
  return partnerContext(partnerId);
}

/** Call LLM for JSON extraction; streams reply_delta when emit is set */
async function callIntakeExtract(
  chat: ChatMessage[],
  opts: { feature: string; userId?: string; taskTier: AiTaskTier; emit?: TraceEmitter },
): Promise<string | null> {
  const runOnce = async (retry: boolean): Promise<string | null> => {
    if (retry) {
      chat[0].content = (chat[0].content ?? "") + "\n\nYou must output one valid JSON object only.";
    } else {
      opts.emit?.({ event: "reply_reset" });
    }
    let streamed = "";
    const onDelta = opts.emit
      ? (d: string) => {
          streamed += d;
          opts.emit!({ event: "reply_delta", delta: d });
        }
      : undefined;

    const { content } = await chatCompletion(chat, {
      jsonMode: !retry,
      temperature: 0.3,
      feature: opts.feature,
      userId: opts.userId,
      taskTier: opts.taskTier,
      onDelta,
    });
    if (opts.emit && streamed) opts.emit({ event: "reply_done" });
    return content;
  };

  try {
    return await runOnce(false);
  } catch {
    return await runOnce(true);
  }
}

const RESEARCH_GUIDE = `[Proactive research (important)]
Goal: fill onboarding fields as completely as possible. All inputs (name only, long text, KMS link, chat) should use multi-source stacking—not one source only.
Before outputting the JSON proposal, combine tools as below (parallel OK, multiple calls OK):

1. User gave KMS link/pageId → read_kms first; then web_search + linkedin_search on company names from the doc for website, size, clients, key people not in KMS
2. After identifying company name from user/KMS → search_partners dedupe; web_search background; linkedin_search executives/contacts
3. Still missing category/playbook/Fanruan angle → search_knowledge team knowledge base
4. After each tool round, check field checklist; keep researching until major fields are sourced or public channels truly have nothing
5. If a tool fails or is unconfigured (e.g. no KMS token), skip and use others—do not block onboarding
6. After research, output JSON proposal (no more tools); in reply briefly note what each source found and what is still missing`;

const MAX_RESEARCH_STEPS = 8;

function normalizeClarifications(raw: unknown): IntakeClarification[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeClarification[] = [];
  for (let i = 0; i < raw.length && out.length < 4; i++) {
    const c = raw[i] as Partial<IntakeClarification> | null;
    if (!c || typeof c.question !== "string" || !Array.isArray(c.options)) continue;
    const options = c.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    if (!options.length) continue;
    out.push({
      id: typeof c.id === "string" && c.id ? c.id : `clarify-${i}`,
      question: c.question.trim(),
      options,
      multi: !!c.multi,
      allowOther: c.allowOther !== false,
    });
  }
  return out;
}

function normalizeIntakeTurn(raw: Partial<IntakeTurn>): IntakeTurn {
  const p: Partial<IntakeProposal> = raw.proposal ?? {};
  return {
    reply: raw.reply || "I've put this together—please review.",
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    clarifications: normalizeClarifications(raw.clarifications),
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
  emitPhase(emit, "extract", "Building proposal");
  emit?.({
    event: "trace",
    step: {
      type: "reasoning",
      id: extractId,
      content: "Building save-ready proposal…",
      status: "running",
    },
  });
  const extractChat = [...chat, { role: "user" as const, content: "Based on the conversation and research above, output the final JSON proposal (strict OUTPUT_SCHEMA, JSON only)." }];
  let content: string | null;
  try {
    ({ content } = await chatCompletion(extractChat, {
      jsonMode: true,
      temperature: 0.3,
      feature,
      userId,
    }));
  } catch {
    extractChat[0].content = (extractChat[0].content ?? "") + "\n\nYou must output one valid JSON object only.";
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
    patch: { status: "done", content: "Proposal ready" },
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
  const [categoryList, industryList, archetypeList, valuePatternList] = await Promise.all([
    taxonomyListForAi("CATEGORY"),
    taxonomyListForAi("INDUSTRY"),
    taxonomyListForAi("ARCHETYPE"),
    taxonomyListForAi("VALUE_PATTERN"),
  ]);
  const taxonomyHint = `Taxonomy values (from library; industries is JSON array, multi-select OK): category=${categoryList}; industries=${industryList}; partnerArchetype=${archetypeList}; valuePattern=${valuePatternList}`;
  let ctx = "";
  if (opts.partnerId) {
    ctx = `\n\n${await partnerContextForScope(opts.scope, opts.partnerId)}`;
  }

  const enrichmentSkills = intakeEnrichmentSkillsForScope(opts.scope);
  const useResearch = enrichmentSkills.length > 0 && !!opts.userId;

  const system = `You are the AI intake assistant for Fanruan Software (Fanruan, leading BI vendor in China; products FineReport/FineBI/FineDataLink) Middle East partner management.
Always reply in English. Use English field codes and enum values in JSON.
Today's date: ${opts.today}.
Current task: ${cfg.title}. ${cfg.intro}

[Guidance rules (important, not rigid)]
${cfg.guide}
Follow-ups should feel like a colleague—natural and brief, not a form. When the user has given enough, produce the proposal and set ready=true; don't chase optional fields.
${useResearch ? `\n${RESEARCH_GUIDE}` : ""}

[Proposal scope for this task]
${cfg.schemaHint}
${taxonomyHint}
${ctx}

${outputSchemaForScope(opts.scope)}`;

  const chat: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of opts.messages) chat.push({ role: m.role, content: m.content, images: m.images });

  const feature = `AI intake: ${cfg.title}`;

  if (useResearch) {
    const tools = await buildIntakeTools(enrichmentSkills);
    const planId = nextTraceId("plan");
    emitPhase(opts.emit, "research", "Multi-source research");
    opts.emit?.({
      event: "trace",
      step: {
        type: "reasoning",
        id: planId,
        content: "Multi-source research in progress…",
        status: "running",
      },
    });
    // Collect incremental extract promises after each tool; await before SSE closes
    const pendingPatches: Promise<void>[] = [];
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
        pendingPatches.push(
          extractPatchFromTool(tc.function.name, result, opts.scope, opts.userId)
            .then((ops) => {
              emitProposalPatch(opts.emit, ops);
            })
            .catch(() => {
              /* single extract failure should not block overall flow */
            })
        );
      },
      executeTool: (tc) => runIntakeToolCall(tc, opts.userId),
    });
    // Wait for all incremental extracts so draft patches are not lost
    if (pendingPatches.length) await Promise.allSettled(pendingPatches);
    opts.emit?.({
      event: "trace_patch",
      id: planId,
      patch: { status: "done", content: "Research complete" },
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

  emitPhase(opts.emit, "extract", "Building proposal");
  const taskTier = intakeTaskTier(opts.scope);
  const content = await callIntakeExtract(chat, {
    feature,
    userId: opts.userId,
    taskTier,
    emit: opts.emit,
  });
  const turn = normalizeIntakeTurn(parseJsonLoose<Partial<IntakeTurn>>(content ?? ""));
  emitProposalUpdate(opts.emit, turn);
  if (opts.emit) {
    opts.emit({ event: "reply_reset" });
    await emitReplyChunks(opts.emit, turn.reply);
  }
  return turn;
}

/** Detect propose-confirm mode (KMS onboarding / profile completion / partner enrichment) */
export function shouldUseProposeMode(messages: IntakeMessage[]): boolean {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  if (/kms\.fineres\.com|pageId=\d+/i.test(text)) return true;
  if (/建档|补全画像|提炼.{0,6}伙伴|录入|创建伙伴|新公司|丰富.{0,4}档案|完善.{0,4}画像|onboard|create partner|new partner|enrich.{0,8}profile|complete.{0,8}profile|intake/i.test(text)) return true;
  return false;
}

export function detectProposeScope(messages: IntakeMessage[], partnerId?: string): IntakeScope {
  if (partnerId) return "profile";
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (/人物|联系人|权力地图|contact|power map|CTO|CEO/i.test(last)) return "powermap";
  if (/商机|opportunity/i.test(last)) return "opportunity";
  return "new_partner";
}

export type ProposeTurn = IntakeTurn & { scope: IntakeScope; mode: "propose" };

/** Assistant propose mode: multi-source research + structured proposal (saved only after confirm) */
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

// ============ Apply intake proposal (after human confirm) ============

const VALID_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];

export async function applyIntake(opts: {
  scope: IntakeScope;
  partnerId?: string;
  proposal: IntakeProposal;
  userId: string;
  sourceText?: string;
  /** active: onboard from Active Partners page as ACTIVE; default is PROSPECT */
  intent?: "prospect" | "active";
}): Promise<{ applied: string[]; partnerId: string }> {
  const { scope, proposal, userId } = opts;
  const applied: string[] = [];
  let partnerId = opts.partnerId ?? "";

  // ---- New partner ----
  if (scope === "new_partner") {
    const asActive = opts.intent === "active";
    const name =
      proposal.partnerName ||
      proposal.fields.find((f) => f.field === "name")?.newValue ||
      "";
    if (!name.trim()) throw new Error("Company name is required for onboarding");
    const data: Record<string, unknown> = asActive
      ? { name: name.trim(), ...ACTIVE_PARTNER_DEFAULTS, promotedAt: new Date() }
      : { name: name.trim(), status: "PROSPECT", poolFlag: "NEW" };
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "fitScore" || f.field === "pipelineStage") {
        const n = parseInt(f.newValue, 10);
        if (!Number.isNaN(n)) data[f.field] = n;
      } else if (f.field === "industries" || f.field === "industry") {
        const norm = normalizeIndustriesInput(f.newValue);
        data.industries = norm.industries;
        data.industry = norm.industry;
      } else {
        data[f.field] = f.newValue;
      }
    }
    const created = await db.partner.create({ data: data as Prisma.PartnerCreateInput });
    partnerId = created.id;
    applied.push(asActive ? `Created active partner: ${created.name}` : `Created prospect: ${created.name}`);
    await db.timelineEvent.create({
      data: {
        partnerId,
        type: "SYSTEM",
        title: asActive ? "AI onboarding (active partner)" : "AI onboarding",
        content: proposal.summary || "Onboarded via AI intake assistant",
        createdById: userId,
        meta: JSON.stringify({ via: "ai-intake", intent: asActive ? "active" : "prospect", sourceText: opts.sourceText?.slice(0, 8000) }),
      },
    });
    if (asActive) await createStarterTodos(partnerId, created.name, userId);
  }

  if (!partnerId) throw new Error("Partner is required");

  // ---- Profile fields (non-onboarding) ----
  if (scope !== "new_partner" && proposal.fields.length) {
    const data: Record<string, unknown> = {};
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "fitScore" || f.field === "pipelineStage") {
        const n = parseInt(f.newValue, 10);
        if (!Number.isNaN(n)) data[f.field] = n;
      } else if (f.field === "industries" || f.field === "industry") {
        const norm = normalizeIndustriesInput(f.newValue);
        data.industries = norm.industries;
        data.industry = norm.industry;
      } else {
        data[f.field] = f.newValue;
      }
      applied.push(`Field "${f.label || PARTNER_FIELD_LABELS[f.field]}" → ${f.newValue}`);
    }
    if (Object.keys(data).length) {
      await db.partner.update({ where: { id: partnerId }, data: data as Prisma.PartnerUpdateInput });
    }
  }

  // ---- Contacts (two passes: save first, then resolve reporting lines) ----
  const contactIdByName = new Map<string, string>();
  for (const c of proposal.contacts) {
    const payload = {
      name: c.name,
      role: c.role && VALID_ROLES.includes(c.role) ? c.role : "INFLUENCER",
      title: c.title,
      department: c.department,
      attitude: typeof c.attitude === "number" && c.attitude >= -1 && c.attitude <= 3 ? c.attitude : undefined,
      contactInfo: c.contactInfo,
      approach: c.approach,
      notes: c.notes,
    };
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null));
    const existing =
      (c.action === "update" && c.id && (await db.contact.findFirst({ where: { id: c.id, partnerId } }))) ||
      (await db.contact.findFirst({ where: { partnerId, name: c.name } }));
    let savedId: string;
    if (existing) {
      await db.contact.update({ where: { id: existing.id }, data: clean });
      savedId = existing.id;
      applied.push(`Updated contact: ${c.name}`);
    } else {
      const created = await db.contact.create({ data: { partnerId, ...clean, name: c.name } });
      savedId = created.id;
      applied.push(`Added contact: ${c.name}`);
    }
    contactIdByName.set(c.name, savedId);
  }

  // Second pass: resolve reportsToName → reportsToId
  for (const c of proposal.contacts) {
    if (!c.reportsToName) continue;
    const subId = contactIdByName.get(c.name);
    if (!subId) continue;
    // Match batch first, then existing DB contacts
    let bossId = contactIdByName.get(c.reportsToName);
    if (!bossId) {
      const boss = await db.contact.findFirst({
        where: { partnerId, name: { contains: c.reportsToName }, NOT: { name: c.name } },
      });
      bossId = boss?.id;
    }
    if (bossId && bossId !== subId) {
      await db.contact.update({ where: { id: subId }, data: { reportsToId: bossId } });
    }
  }

  // ---- Opportunities ----
  for (const o of proposal.opportunities) {
    const payload = {
      name: o.name,
      client: o.client,
      amount: o.amount,
      stage: o.stage ?? "Needs Discovery",
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
      applied.push(`Updated opportunity: ${o.name}`);
    } else {
      await db.opportunity.create({ data: { partnerId, ...clean, name: o.name } });
      applied.push(`Added opportunity: ${o.name}`);
    }
  }

  // ---- Training ----
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
    applied.push(`Added training: ${t.person}${t.targetCert ? ` → ${t.targetCert}` : ""}`);
  }

  // ---- Joint solutions ----
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
    applied.push(`Added joint solution: ${s.name}`);
  }

  // ---- Todos ----
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
    applied.push(`Added todo: ${t.title}`);
  }

  // ---- Timeline audit (non-onboarding; onboarding already logged) ----
  if (scope !== "new_partner" && partnerId) {
    await db.timelineEvent.create({
      data: {
        partnerId,
        type: "AI_SUMMARY",
        title: `AI intake: ${SCOPE_CONFIG[scope].title}`,
        content: proposal.summary || applied.join("；"),
        createdById: userId,
        meta: JSON.stringify({ via: "ai-intake", scope, applied, sourceText: opts.sourceText?.slice(0, 8000) }),
      },
    });
  }

  return { applied, partnerId };
}
