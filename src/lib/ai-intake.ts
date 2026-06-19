import { Prisma } from "@prisma/client";
import { db } from "./db";
import { chatCompletion, parseJsonLoose, safeParseJsonLoose, type ChatMessage, type ToolCall } from "./ai";
import type { AiTaskTier } from "./ai-capabilities";
import { maxTokensForTaskTier } from "./ai-capabilities";
import { runToolLoop } from "./ai-tool-loop";
import { nextTraceId, emitReplyChunks, emitProposalUpdate, emitProposalPatch, emitPhase, type TraceEmitter } from "./ai-trace";
import { extractPatchFromTool } from "./proposal-patch-extract";
import { isKmsConfiguredForUser, prefetchKmsFromText } from "./kms";
import { isKnowhowConfigured } from "./knowhow";
import {
  buildIntakeTools,
  intakeEnrichmentSkillsForScope,
  newSkillContext,
  runSkill,
} from "./skills";
import {
  buildIntakeSystemPrompt,
  buildFastIntakeSystemPrompt,
  applyContactAdded,
  applyContactUpdated,
  applyFieldMessage,
  applyOpportunityAdded,
  applyOpportunityUpdated,
  applyPartnerCreated,
  applySolutionAdded,
  applyBusinessRecordAdded,
  applyTodoAdded,
  applyTrainingAdded,
  defaultIntakeReply,
  extractFinalJsonUserMessage,
  fieldLabel,
  normalizeFieldUpdateLabels,
  type IntakeScope as AiLocaleScope,
} from "./ai-locale";
import type { Locale } from "./i18n/locale";
import { taxonomyListForAi, normalizeIndustriesInput } from "./taxonomy";
import {
  businessRecordContext,
  intakeBoundPartnerLine,
  partnerContext,
  powermapContext,
  type ContactProposal,
  type FieldUpdate,
  type OpportunityProposal,
  type TodoProposal,
} from "./proposals";
import { PARTNER_FIELD_LABELS, SOLUTION_STATUS_LABELS } from "./constants";

import { ACTIVE_PARTNER_DEFAULTS, createStarterTodos } from "./partner-onboarding";
import { partnerFieldValueFromText } from "./tier";
import {
  finalizeFastIntakeTurn,
  heuristicFastIntakeTurn,
  lastIntakeUserText,
  stripIntakeCommandPrefix,
} from "./fast-intake-heuristic";
import { normalizeCrmTraceAction, normalizeCrmTraceNature } from "./crm-trace-constants";
import {
  businessRecordCrmFieldsComplete,
  inferTraceAction,
  inferTraceNature,
} from "./crm-trace-payload";
import { persistBusinessRecord, normalizeBusinessRecordCategory, type BusinessRecordCategory } from "./business-record-core";
import { countProposalItems } from "./proposal-merge";
import {
  buildPartnerBindingPrompt,
  enrichProposalPartnerFromText,
  intakeScopeRequiresPartner,
  loadIntakePartnerBinding,
  resolveIntakePartner,
} from "./intake-partner-binding";
import { enrichBusinessRecordCompanyTarget, resolveBusinessRecordCompanyTarget } from "./business-record-intake";
import { submitBusinessRecordToCrmOnly } from "./crm-business-record";
import { isFastIntakeScope, sanitizeProposalForScope } from "./proposal-scope";

export type IntakeScope = AiLocaleScope;

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

export type BusinessRecordProposal = {
  title: string;
  content?: string;
  category?: string;
  occurredAt?: string;
  contactName?: string;
  /** CRM KPI：现场 | 非现场 */
  traceNature?: string;
  /** CRM 商务行为 */
  traceAction?: string;
  reason?: string;
};

export type IntakeProposal = {
  partnerName?: string;
  /** Partner Hub 伙伴 ID（仅当系统中确有建档时才有） */
  hubPartnerId?: string;
  /** CRM 客户 ID（com_id），开放录入时可能仅有 CRM 无 Hub 伙伴 */
  crmCustomerId?: string;
  crmCustomerName?: string;
  /** both=Hub+CRM（默认）；crm_only=仅写入 CRM（Hub 未建档时用户确认） */
  saveMode?: "both" | "crm_only";
  summary: string;
  fields: FieldUpdate[];
  contacts: ContactProposal[];
  opportunities: OpportunityProposal[];
  todos: TodoProposal[];
  trainings: TrainingProposal[];
  solutions: SolutionProposal[];
  businessRecords: BusinessRecordProposal[];
};

/** Structured clarification: selectable options when info is incomplete */
export type IntakeClarification = {
  id: string;
  question: string; // One-line clarification question
  options: string[]; // Options (user tap to fill back)
  multi?: boolean; // Allow multi-select
  allowOther?: boolean; // Allow "Other / manual entry"
  /** direct = write to draft locally; ai = batch to LLM after all picks (inferred from id when omitted) */
  apply?: "direct" | "ai";
  /** identity = company anchor (name/website/dedupe); field = profile enum pick */
  kind?: "identity" | "field";
  /** When true, final save stays disabled until user picks (identity checkpoints) */
  blocking?: boolean;
};

export type IntakeTurn = {
  reply: string; // AI message to user (natural tone, may include follow-ups)
  questions: string[]; // Open clarification points (guidance)
  clarifications: IntakeClarification[]; // Structured option clarifications
  ready: boolean; // Whether info is sufficient to save
  /** 商务记录：Hub 未建档但 CRM 已匹配，可「仅CRM」保存 */
  crmOnlyReady?: boolean;
  proposal: IntakeProposal;
};

export type IntakeMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { url: string; name?: string }[];
};

function emptyProposal(): IntakeProposal {
  return { summary: "", fields: [], contacts: [], opportunities: [], todos: [], trainings: [], solutions: [], businessRecords: [] };
}

/** Lightweight intake scopes use the fast model (attribute extraction, no deep reasoning) */
function intakeTaskTier(scope: IntakeScope): AiTaskTier {
  return isFastIntakeScope(scope) ? "fast" : "standard";
}

async function partnerContextForScope(scope: IntakeScope, partnerId: string, locale: Locale): Promise<string> {
  if (scope === "powermap") return powermapContext(partnerId, locale);
  if (scope === "business_record" || scope === "training") return businessRecordContext(partnerId, locale);
  if (isFastIntakeScope(scope)) return intakeBoundPartnerLine(partnerId, locale);
  return partnerContext(partnerId, locale);
}

/** Call LLM for JSON extraction; streams reply_delta when emit is set */
async function callIntakeExtract(
  chat: ChatMessage[],
  opts: { feature: string; userId?: string; taskTier: AiTaskTier; emit?: TraceEmitter; streamFast?: boolean },
): Promise<string | null> {
  const runOnce = async (retry: boolean): Promise<string | null> => {
    if (retry) {
      chat[0].content = (chat[0].content ?? "") + "\n\nYou must output one valid JSON object only.";
    } else {
      opts.emit?.({ event: "reply_reset" });
    }
    let streamed = "";
    const streamReply = opts.taskTier !== "fast" || opts.streamFast;
    const onDelta =
      opts.emit && streamReply
        ? (d: string) => {
            streamed += d;
            opts.emit!({ event: "reply_delta", delta: d });
          }
        : undefined;

    const { content } = await chatCompletion(chat, {
      jsonMode: !retry,
      temperature: opts.taskTier === "fast" ? 0.1 : 0.3,
      feature: opts.feature,
      userId: opts.userId,
      taskTier: opts.taskTier,
      maxTokens: maxTokensForTaskTier(opts.taskTier),
      onDelta,
    });
    if (opts.emit && streamed) opts.emit({ event: "reply_done" });
    const merged = (content ?? "").trim() || streamed.trim();
    return merged || null;
  };

  try {
    return await runOnce(false);
  } catch {
    return await runOnce(true);
  }
}

const MAX_RESEARCH_STEPS = 8;

function normalizeClarifications(raw: unknown, scope?: IntakeScope): IntakeClarification[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeClarification[] = [];
  for (let i = 0; i < raw.length && out.length < 4; i++) {
    const c = raw[i] as Partial<IntakeClarification> | null;
    if (!c || typeof c.question !== "string" || !Array.isArray(c.options)) continue;
    const options = c.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    if (!options.length) continue;
    const kind = c.kind === "identity" || c.kind === "field" ? c.kind : undefined;
    const id = typeof c.id === "string" && c.id ? c.id : `clarify-${i}`;
    const isIdentity =
      kind === "identity" || id === "partnerName" || id === "name" || id === "website" || id === "dedupe";
    const isTodoPartnerNotFound = id === "todo-partner-not-found";
    out.push({
      id,
      question: c.question.trim(),
      options,
      multi: !!c.multi,
      allowOther: c.allowOther !== false,
      apply: c.apply === "direct" || c.apply === "ai" ? c.apply : undefined,
      kind: isIdentity ? "identity" : kind,
      blocking: isTodoPartnerNotFound ? true : (c.blocking ?? isIdentity),
    });
  }
  return out;
}

/** AI JSON may return numbers/arrays where strings are expected */
function asTrimmedString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean).join(", ");
  return String(v).trim();
}

function intakeParseErrorReply(locale: Locale, detail: string): string {
  const short = detail.slice(0, 160);
  return locale === "zh"
    ? `抱歉，AI 返回的内容格式有误，没能完整解析。右侧已保留当前草稿，你可以继续补充或在右侧修改后保存。\n\n（${short}）`
    : `Sorry — the AI response had a format error. Your draft on the right is preserved; add more detail or edit before saving.\n\n(${short})`;
}

function fallbackIntakeTurn(
  locale: Locale,
  detail: string,
  partial: Partial<IntakeTurn> | undefined,
  scope: IntakeScope,
): IntakeTurn {
  const base = normalizeIntakeTurn(partial ?? {}, locale, scope);
  const hasDraft = countProposalItems(base.proposal) > 0;
  const reply = hasDraft
    ? locale === "zh"
      ? scope === "business_record"
        ? "部分字段已解析。请核对右侧草案并补充 CRM 必填项，或继续描述。"
        : "部分字段已解析。请核对右侧草案，或在下方回答追问后继续。"
      : scope === "business_record"
        ? "Partial draft on the right — fill CRM fields or add more detail."
        : "Partial draft on the right — review or answer follow-ups below."
    : intakeParseErrorReply(locale, detail);
  return {
    ...base,
    reply,
    ready: false,
    clarifications: base.clarifications.length ? base.clarifications : [],
  };
}

async function finalizeIntakeTurn(
  turn: IntakeTurn,
  scope: IntakeScope,
  locale: Locale,
  opts?: { partnerId?: string; userText?: string }
): Promise<IntakeTurn> {
  let proposal = turn.proposal;
  if (scope === "business_record") {
    proposal = await enrichBusinessRecordCompanyTarget(proposal, opts?.userText ?? "", opts?.partnerId);
  } else if (!opts?.partnerId && opts?.userText) {
    const { enrichProposalPartnerFromText } = await import("./intake-partner-binding");
    proposal = await enrichProposalPartnerFromText(proposal, opts.userText, opts?.partnerId);
  }
  const next = { ...turn, proposal };
  return isFastIntakeScope(scope)
    ? await finalizeFastIntakeTurn(scope, next, locale, {
        boundPartnerId: opts?.partnerId,
        userText: opts?.userText,
      })
    : next;
}

async function parseIntakeTurnFromContent(
  content: string,
  locale: Locale,
  scope: IntakeScope,
  opts?: {
    chat?: ChatMessage[];
    feature?: string;
    userId?: string;
    taskTier?: AiTaskTier;
    today?: string;
    partnerId?: string;
  }
): Promise<IntakeTurn> {
  const userText = lastIntakeUserText(opts?.chat, scope);
  const finalizeOpts = { partnerId: opts?.partnerId, userText };

  const direct = safeParseJsonLoose<Partial<IntakeTurn>>(content);
  if (direct) {
    try {
      const turn = normalizeIntakeTurn(direct, locale, scope);
      return finalizeIntakeTurn(turn, scope, locale, finalizeOpts);
    } catch {
      /* normalize failed — try repair below */
    }
  }

  if (opts?.chat?.length && opts.feature) {
    try {
      const fixChat: ChatMessage[] = [
        ...opts.chat,
        {
          role: "user",
          content:
            "The JSON below is invalid. Output ONLY one corrected valid JSON object (same schema, same extracted facts). No markdown.\n\n" +
            content.slice(0, 14000),
        },
      ];
      const { content: fixed } = await chatCompletion(fixChat, {
        jsonMode: true,
        temperature: 0.1,
        feature: `${opts.feature} (json repair)`,
        userId: opts.userId,
        taskTier: opts.taskTier,
        maxTokens: maxTokensForTaskTier(opts.taskTier),
      });
      const repaired = safeParseJsonLoose<Partial<IntakeTurn>>(fixed ?? "");
      if (repaired) {
        const turn = normalizeIntakeTurn(repaired, locale, scope);
        return finalizeIntakeTurn(turn, scope, locale, finalizeOpts);
      }
    } catch {
      /* repair call failed */
    }
  }

  if (isFastIntakeScope(scope)) {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10);
    const heuristic = userText ? heuristicFastIntakeTurn(scope, userText, locale, today) : null;
    if (heuristic) return finalizeIntakeTurn(heuristic, scope, locale, finalizeOpts);
  }

  let detail = "Invalid JSON";
  try {
    parseJsonLoose(content);
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  const partial = direct ?? undefined;
  const fallback = fallbackIntakeTurn(locale, detail, partial, scope);
  return finalizeIntakeTurn(fallback, scope, locale, finalizeOpts);
}

function normalizeIntakeTurn(raw: Partial<IntakeTurn>, locale: Locale, scope: IntakeScope): IntakeTurn {
  const p: Partial<IntakeProposal> = raw.proposal ?? {};
  const coerceField = (f: FieldUpdate): FieldUpdate => ({
    ...f,
    label: fieldLabel(locale, f.field) || f.label,
    oldValue: f.oldValue == null ? null : asTrimmedString(f.oldValue),
    newValue: asTrimmedString(f.newValue),
  });
  const turn: IntakeTurn = {
    reply: raw.reply || defaultIntakeReply(locale),
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    clarifications: normalizeClarifications(raw.clarifications, scope),
    ready: !!raw.ready,
    proposal: {
      partnerName: p.partnerName == null ? undefined : asTrimmedString(p.partnerName),
      hubPartnerId: p.hubPartnerId == null ? undefined : asTrimmedString(p.hubPartnerId),
      crmCustomerId: p.crmCustomerId == null ? undefined : asTrimmedString(p.crmCustomerId),
      crmCustomerName: p.crmCustomerName == null ? undefined : asTrimmedString(p.crmCustomerName),
      saveMode: p.saveMode === "crm_only" ? "crm_only" : p.saveMode === "both" ? "both" : undefined,
      summary: asTrimmedString(p.summary),
      fields: normalizeFieldUpdateLabels(
        (p.fields ?? []).filter((f) => f.field in PARTNER_FIELD_LABELS).map(coerceField),
        locale,
      ),
      contacts: p.contacts ?? [],
      opportunities: p.opportunities ?? [],
      todos: p.todos ?? [],
      trainings: p.trainings ?? [],
      solutions: p.solutions ?? [],
      businessRecords: (p.businessRecords ?? []).map((r) => {
        let title = asTrimmedString(r.title);
        let content = r.content == null ? undefined : asTrimmedString(r.content);
        if (scope === "business_record") {
          title = stripIntakeCommandPrefix(title, scope) || title;
          if (content) content = stripIntakeCommandPrefix(content, scope) || content;
        }
        const category = r.category == null ? undefined : asTrimmedString(r.category);
        const cat = normalizeBusinessRecordCategory(category ?? "OTHER");
        const traceNature =
          normalizeCrmTraceNature(r.traceNature == null ? undefined : asTrimmedString(r.traceNature)) ??
          inferTraceNature(title, content, cat);
        const traceAction =
          normalizeCrmTraceAction(r.traceAction == null ? undefined : asTrimmedString(r.traceAction)) ??
          inferTraceAction(title, content, cat);
        return {
          ...r,
          title,
          content,
          category,
          occurredAt: r.occurredAt == null ? undefined : asTrimmedString(r.occurredAt),
          contactName: r.contactName == null ? undefined : asTrimmedString(r.contactName),
          traceNature,
          traceAction,
          reason: r.reason == null ? undefined : asTrimmedString(r.reason),
        };
      }).filter((r) => r.title),
    },
  };
  turn.proposal = sanitizeProposalForScope(scope, turn.proposal);
  if (scope === "business_record") {
    turn.ready =
      turn.proposal.businessRecords.length > 0 &&
      businessRecordCrmFieldsComplete(turn.proposal.businessRecords);
  } else if (scope === "todo") {
    turn.ready = turn.proposal.todos.some((t) => !!asTrimmedString(t.title));
  } else if (scope === "opportunity") {
    turn.ready = turn.proposal.opportunities.some((o) => !!asTrimmedString(o.name));
  } else if (scope === "powermap") {
    turn.ready = turn.proposal.contacts.some((c) => !!asTrimmedString(c.name));
  } else if (scope === "training") {
    turn.ready = turn.proposal.trainings.some((t) => !!asTrimmedString(t.person));
  } else if (scope === "solution") {
    turn.ready = turn.proposal.solutions.some((s) => !!asTrimmedString(s.name));
  }
  return turn;
}

async function extractIntakeJson(
  chat: ChatMessage[],
  feature: string,
  locale: Locale,
  scope: IntakeScope,
  userId?: string,
  emit?: TraceEmitter,
  partnerId?: string,
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
  const extractChat = [...chat, { role: "user" as const, content: extractFinalJsonUserMessage(locale) }];
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
  const turn = await parseIntakeTurnFromContent(content ?? "", locale, scope, {
    chat: extractChat,
    feature,
    userId,
    partnerId,
  });
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
  locale: Locale;
}): Promise<IntakeTurn> {
  const locale = opts.locale;
  const fast = isFastIntakeScope(opts.scope);
  let taxonomyHint = "";
  if (!fast) {
    const [categoryList, industryList, archetypeList, valuePatternList] = await Promise.all([
      taxonomyListForAi("CATEGORY"),
      taxonomyListForAi("INDUSTRY"),
      taxonomyListForAi("ARCHETYPE"),
      taxonomyListForAi("VALUE_PATTERN"),
    ]);
    taxonomyHint = `Taxonomy values (from library; industries is JSON array, multi-select OK): category=${categoryList}; industries=${industryList}; partnerArchetype=${archetypeList}; valuePattern=${valuePatternList}`;
  }
  let partnerCtx = "";
  const binding = await loadIntakePartnerBinding(opts.partnerId);
  if (opts.partnerId) {
    partnerCtx = await partnerContextForScope(opts.scope, opts.partnerId, locale);
  }

  const enrichmentSkills = intakeEnrichmentSkillsForScope(opts.scope);
  const useResearch = !fast && enrichmentSkills.length > 0 && !!opts.userId;
  const kmsConfigured = useResearch ? await isKmsConfiguredForUser(opts.userId) : false;
  const knowhowConfigured = useResearch ? await isKnowhowConfigured() : false;

  const bindingBlock = buildPartnerBindingPrompt({ locale, scope: opts.scope, binding });
  const system = fast
    ? buildFastIntakeSystemPrompt({
        locale,
        scope: opts.scope,
        today: opts.today,
        partnerContext: partnerCtx || undefined,
        partnerBinding: bindingBlock,
      })
    : buildIntakeSystemPrompt({
        locale,
        scope: opts.scope,
        today: opts.today,
        taxonomyHint,
        partnerContext: partnerCtx || undefined,
        partnerBinding: bindingBlock,
        useResearch,
        kmsConfigured,
        knowhowConfigured,
      });

  const chat: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of opts.messages) chat.push({ role: m.role, content: m.content, images: m.images });

  const feature = `AI intake: ${opts.scope}`;

  if (useResearch) {
    const userText = opts.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    const kmsPrefetch = kmsConfigured ? await prefetchKmsFromText(opts.userId, userText) : null;
    if (kmsPrefetch?.ok) {
      const prefetchId = nextTraceId("tool");
      emitPhase(opts.emit, "research", "Multi-source research");
      opts.emit?.({
        event: "trace",
        step: {
          type: "tool",
          id: prefetchId,
          name: "read_kms",
          label: "Read KMS documents",
          args: { urls: kmsPrefetch.urls },
          argHint: `${kmsPrefetch.urls.length} link(s)`,
          status: "running",
        },
      });
      chat.push({
        role: "user",
        content:
          locale === "zh"
            ? `[系统已自动读取 KMS，以下内容可直接用于建档，勿说 KMS 未配置]\n\n${kmsPrefetch.content}`
            : `[System pre-fetched KMS — use directly for onboarding; do NOT say KMS is unconfigured]\n\n${kmsPrefetch.content}`,
      });
      opts.emit?.({
        event: "trace_patch",
        id: prefetchId,
        patch: {
          status: "done",
          content: `Read ${kmsPrefetch.content.length} chars from ${kmsPrefetch.urls.length} KMS link(s)`,
        },
      });
    }

    const tools = await buildIntakeTools(enrichmentSkills);
    const planId = nextTraceId("plan");
    if (!kmsPrefetch?.ok) {
      emitPhase(opts.emit, "research", "Multi-source research");
    }
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
          extractPatchFromTool(tc.function.name, result, opts.scope, locale, opts.userId)
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
      const turn = await parseIntakeTurnFromContent(researchContent, locale, opts.scope, {
        chat,
        feature,
        userId: opts.userId,
        partnerId: opts.partnerId,
      });
      if (turn.proposal.summary || turn.proposal.partnerName || countProposalItems(turn.proposal) > 0) {
        emitProposalUpdate(opts.emit, turn);
        await emitReplyChunks(opts.emit, turn.reply);
        return turn;
      }
    }
    return extractIntakeJson(chat, feature, locale, opts.scope, opts.userId, opts.emit, opts.partnerId);
  }

  emitPhase(opts.emit, "extract", "Building proposal");
  const taskTier = intakeTaskTier(opts.scope);
  const content = await callIntakeExtract(chat, {
    feature,
    userId: opts.userId,
    taskTier,
    emit: opts.emit,
    streamFast: false,
  });
  const turn = await parseIntakeTurnFromContent(content ?? "", locale, opts.scope, {
    chat,
    feature,
    userId: opts.userId,
    taskTier,
    today: opts.today,
    partnerId: opts.partnerId,
  });
  emitProposalUpdate(opts.emit, turn);
  if (opts.emit) {
    opts.emit({ event: "reply_reset" });
    if (fast && turn.reply) {
      opts.emit({ event: "reply_delta", delta: turn.reply });
      opts.emit({ event: "reply_done" });
    } else {
      await emitReplyChunks(opts.emit, turn.reply);
    }
  }
  return turn;
}

/** Shared regex for propose-mode intent (assistant dock UI + server routing) */
export const PROPOSE_INTENT_RE =
  /kms\.fineres\.com|pageId=\d+|建档|补全画像|提炼.{0,6}伙伴|录入伙伴|创建伙伴|新公司|丰富.{0,4}档案|完善.{0,4}画像|商务记录|拜访记录|会议纪要|跟进记录|见面记录|记录拜访|记录会议|待办|创建待办|记待办|加待办|添加待办|添加商机|新建商机|加联系人|添加联系人|新联系人|培训计划|认证计划|联合方案|onboard|create partner|new partner|enrich.{0,8}profile|complete.{0,8}profile|business record|meeting log|visit log|log opportunity|add contact|create todo|add todo|log todo|intake/i;

/** Detect propose-confirm mode (collaborative agents: onboarding, records, opportunities, etc.) */
export function shouldUseProposeMode(messages: IntakeMessage[]): boolean {
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  return PROPOSE_INTENT_RE.test(text);
}

/** Strip partner-binding suffix appended to WeCom user messages before scope detection. */
export function stripIntakeSystemHint(content: string): string {
  const zh = content.indexOf("\n\n（系统提示：");
  if (zh >= 0) return content.slice(0, zh).trim();
  const en = content.indexOf("\n\n[System ");
  if (en >= 0) return content.slice(0, en).trim();
  return content.trim();
}

export function detectProposeScope(messages: IntakeMessage[], partnerId?: string): IntakeScope {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const text = stripIntakeSystemHint(last);
  // Business record before todo — bound-group hints may mention 待办; user may say 记个商务记录.
  if (
    /商务记录|拜访记录|会议纪要|跟进记录|见面|记录拜访|记录会议|记.{0,4}商务|拜访|business record|meeting log|visit log|log.{0,6}visit/i.test(
      text
    )
  ) {
    return "business_record";
  }
  if (
    /记.{0,4}待办|创建待办|加待办|添加待办|^待办[：:，,\s]|待办[：:，,]|create todo|add todo|log todo/i.test(
      text
    )
  ) {
    return "todo";
  }
  if (/商机|添加商机|新建商机|opportunity|pipeline/i.test(last)) return "opportunity";
  if (/联系人|权力地图|加联系人|添加联系人|新联系人|contact|power map|名片|CTO|CEO/i.test(last)) {
    return "powermap";
  }
  if (/培训|认证|FCA|training plan/i.test(last)) return "training";
  if (/联合方案|solution/i.test(last)) return "solution";
  if (/建档|补全|画像|profile|onboard|kms/i.test(last)) return partnerId ? "profile" : "new_partner";
  if (partnerId) return "profile";
  return "new_partner";
}

const PROPOSE_CONFIRM_RE =
  /^(确认|确认保存|保存|提交|好的保存|可以保存|确认提交|apply|confirm|ok save|save)$/i;
const PROPOSE_CANCEL_RE = /^(取消|放弃|不要了|cancel|discard|abort)$/i;

/** 群聊 @机器人 时前缀仅含 bot 显示名（无中文业务正文） */
const WECOM_BOT_NAME_PREFIX_RE = /^[\w.\s-]{1,40}$/;

/**
 * 识别 propose 确认/取消指令。群聊必须 @ 机器人，如「@MENA Beard Gang 确认」。
 */
function matchesProposeCommand(text: string, directRe: RegExp, wordsPattern: string): boolean {
  const t = text.trim();
  if (directRe.test(t)) return true;
  const atMatch = t.match(new RegExp(`^@(.+)\\s+(${wordsPattern})\\s*$`, "i"));
  if (!atMatch) return false;
  const prefix = atMatch[1].trim();
  return WECOM_BOT_NAME_PREFIX_RE.test(prefix);
}

/** User confirms a pending propose draft (WeCom / text channels) */
export function isProposeConfirm(text: string): boolean {
  return matchesProposeCommand(
    text,
    PROPOSE_CONFIRM_RE,
    "确认|确认保存|保存|提交|好的保存|可以保存|确认提交|apply|confirm|ok save|save"
  );
}

/** User confirms CRM-only save when Hub has no partner but CRM matched */
export function isProposeCrmOnlyConfirm(text: string): boolean {
  return matchesProposeCommand(
    text,
    /^(仅crm|只填crm|仅同步crm|只写crm|crm only|crm-only)$/i,
    "仅crm|只填crm|仅同步crm|只写crm|crm only|crm-only"
  );
}

/** User cancels a pending propose draft */
export function isProposeCancel(text: string): boolean {
  return matchesProposeCommand(text, PROPOSE_CANCEL_RE, "取消|放弃|不要了|cancel|discard|abort");
}

export type ProposeTurn = IntakeTurn & { scope: IntakeScope; mode: "propose" };

/** Assistant propose mode: multi-source research + structured proposal (saved only after confirm) */
export async function runProposeTurn(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  userId?: string;
  emit?: TraceEmitter;
  scope?: IntakeScope;
  locale: Locale;
}): Promise<ProposeTurn> {
  const scope = opts.scope ?? detectProposeScope(opts.messages, opts.partnerId);
  const turn = await runIntakeTurn({
    scope,
    partnerId: opts.partnerId,
    messages: opts.messages,
    today: new Date().toISOString().slice(0, 10),
    userId: opts.userId,
    emit: opts.emit,
    locale: opts.locale,
  });
  return { ...turn, scope, mode: "propose" };
}

// ============ Apply intake proposal (after human confirm) ============

const VALID_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];

function parseOptionalDate(raw: unknown): Date | undefined {
  const s = asTrimmedString(raw);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function applyIntake(opts: {
  scope: IntakeScope;
  partnerId?: string;
  proposal: IntakeProposal;
  userId: string;
  sourceText?: string;
  /** active: onboard from Active Partners page as ACTIVE; default is PROSPECT */
  intent?: "prospect" | "active";
  locale: Locale;
}): Promise<{ applied: string[]; partnerId: string }> {
  const { scope, userId, locale } = opts;
  const proposal = sanitizeProposalForScope(scope, opts.proposal);
  const applied: string[] = [];
  let partnerId = opts.partnerId ?? "";

  // ---- New partner ----
  if (scope === "new_partner") {
    const asActive = opts.intent === "active";
    const name = asTrimmedString(
      proposal.partnerName || proposal.fields.find((f) => f.field === "name")?.newValue || ""
    );
    if (!name) throw new Error("Company name is required for onboarding");
    const data: Record<string, unknown> = asActive
      ? { name, ...ACTIVE_PARTNER_DEFAULTS, promotedAt: new Date() }
      : { name, status: "PROSPECT", poolFlag: "NEW" };
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "industries" || f.field === "industry") {
        const norm = normalizeIndustriesInput(f.newValue);
        data.industries = norm.industries;
        data.industry = norm.industry;
      } else {
        const parsed = partnerFieldValueFromText(f.field, asTrimmedString(f.newValue));
        if (parsed !== undefined) data[f.field] = parsed;
      }
    }
    let created;
    try {
      created = await db.partner.create({ data: data as Prisma.PartnerCreateInput });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new Error(`Partner "${name}" already exists — open the existing record or use a different name.`);
      }
      throw e;
    }
    partnerId = created.id;
    applied.push(applyPartnerCreated(locale, created.name, asActive));
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
  } else if (scope === "todo" || intakeScopeRequiresPartner(scope)) {
    if (scope === "business_record" && proposal.saveMode === "crm_only" && proposal.crmCustomerId) {
      partnerId = "";
    } else {
      const resolved = await resolveIntakePartner({
        scope,
        boundPartnerId: opts.partnerId,
        proposal,
        locale,
      });
      if (!resolved.ok) throw new Error(resolved.error);
      partnerId = resolved.partnerId;
    }
  }

  if (intakeScopeRequiresPartner(scope) && !partnerId) {
    const crmOnlyOk =
      scope === "business_record" && proposal.saveMode === "crm_only" && !!proposal.crmCustomerId;
    if (!crmOnlyOk) {
      throw new Error(
        locale === "zh"
          ? "无法确定所属伙伴，请说明公司名称或在伙伴详情页 / 已绑定企微群中录入"
          : "Could not determine partner — name the company or use a partner page / bound WeCom group"
      );
    }
  }

  // ---- Profile fields (non-onboarding) ----
  if (scope !== "new_partner" && partnerId && proposal.fields.length) {
    const data: Record<string, unknown> = {};
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "industries" || f.field === "industry") {
        const norm = normalizeIndustriesInput(f.newValue);
        data.industries = norm.industries;
        data.industry = norm.industry;
      } else {
        const parsed = partnerFieldValueFromText(f.field, asTrimmedString(f.newValue));
        if (parsed !== undefined) {
          data[f.field] = parsed;
          applied.push(applyFieldMessage(locale, f.label || fieldLabel(locale, f.field), asTrimmedString(f.newValue)));
        }
      }
    }
    if (Object.keys(data).length) {
      await db.partner.update({ where: { id: partnerId }, data: data as Prisma.PartnerUpdateInput });
    }
  }

  // ---- Contacts (two passes: save first, then resolve reporting lines) ----
  const contactIdByName = new Map<string, string>();
  if (partnerId) for (const c of proposal.contacts) {
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
      applied.push(applyContactUpdated(locale, c.name));
    } else {
      const created = await db.contact.create({ data: { partnerId, ...clean, name: c.name } });
      savedId = created.id;
      applied.push(applyContactAdded(locale, c.name));
    }
    contactIdByName.set(c.name, savedId);
  }

  // Second pass: resolve reportsToName → reportsToId
  if (partnerId) for (const c of proposal.contacts) {
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
  if (partnerId) for (const o of proposal.opportunities) {
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
      applied.push(applyOpportunityUpdated(locale, o.name));
    } else {
      await db.opportunity.create({ data: { partnerId, ...clean, name: o.name } });
      applied.push(applyOpportunityAdded(locale, o.name));
    }
  }

  // ---- Training ----
  if (partnerId) for (const t of proposal.trainings) {
    if (!asTrimmedString(t.person)) continue;
    await db.training.create({
      data: {
        partnerId,
        person: t.person,
        currentSkill: t.currentSkill,
        targetCert: t.targetCert,
        method: t.method,
        deadline: parseOptionalDate(t.deadline),
        status: t.status && ["PLANNED", "IN_PROGRESS", "DONE"].includes(t.status) ? t.status : "PLANNED",
      },
    });
    applied.push(applyTrainingAdded(locale, t.person, t.targetCert));
  }

  // ---- Joint solutions ----
  if (partnerId) for (const s of proposal.solutions) {
    if (!asTrimmedString(s.name)) continue;
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
    applied.push(applySolutionAdded(locale, s.name));
  }

  // ---- Business records ----
  const brTarget =
    scope === "business_record"
      ? await resolveBusinessRecordCompanyTarget({
          proposal,
          boundPartnerId: opts.partnerId,
          saveMode: proposal.saveMode,
        })
      : null;

  for (const r of proposal.businessRecords) {
    const title = asTrimmedString(r.title);
    if (!title) continue;

    if (proposal.saveMode === "crm_only" && proposal.crmCustomerId) {
      const crmResult = await submitBusinessRecordToCrmOnly({
        crmCustomerId: proposal.crmCustomerId,
        userId,
        category: normalizeBusinessRecordCategory(r.category ?? "OTHER"),
        title,
        content: r.content ?? null,
        occurredAt: parseOptionalDate(r.occurredAt) ?? new Date(),
        traceNature: r.traceNature,
        traceAction: r.traceAction,
      });
      if (crmResult.status === "failed") throw new Error(crmResult.error);
      const label = proposal.crmCustomerName ?? proposal.crmCustomerId;
      applied.push(
        crmResult.status === "synced"
          ? locale === "zh"
            ? `已写入帆软 CRM（${label}，未存 Partner Hub）`
            : `Saved to FanRuan CRM (${label}, not in Partner Hub)`
          : locale === "zh"
            ? `CRM 未写入：${crmResult.reason}`
            : `CRM skipped: ${crmResult.reason}`
      );
      continue;
    }

    const recordPartnerId = partnerId || brTarget?.hubPartnerId;
    if (!recordPartnerId) {
      throw new Error(
        locale === "zh"
          ? "未找到 Partner Hub 伙伴；若仅在 CRM 有该客户，请回复「仅CRM」"
          : 'Partner not found in Partner Hub — reply「仅CRM」if the customer exists in CRM only'
      );
    }

    let contactId: string | null = null;
    if (r.contactName) {
      const contact = await db.contact.findFirst({
        where: { partnerId: recordPartnerId, name: { contains: r.contactName } },
      });
      contactId = contact?.id ?? null;
    }
    await persistBusinessRecord({
      partnerId: recordPartnerId,
      userId,
      category: r.category ?? "OTHER",
      title,
      content: r.content ?? null,
      occurredAt: parseOptionalDate(r.occurredAt) ?? new Date(),
      contactId,
      traceNature: r.traceNature,
      traceAction: r.traceAction,
      source: "AI",
    });
    applied.push(applyBusinessRecordAdded(locale, title));
  }

  // ---- Todos ----
  for (const t of proposal.todos) {
    await db.todoItem.create({
      data: {
        title: t.title,
        detail: t.detail,
        partnerId: partnerId || null,
        assigneeId: userId,
        dueDate: parseOptionalDate(t.dueDate),
        priority: t.priority && ["HIGH", "MEDIUM", "LOW"].includes(t.priority) ? t.priority : "MEDIUM",
        source: "AI",
      },
    });
    applied.push(applyTodoAdded(locale, t.title));
  }

  // ---- Timeline audit (non-onboarding; onboarding already logged) ----
  if (scope !== "new_partner" && scope !== "business_record" && scope !== "todo" && partnerId) {
    const intakeTitle =
      locale === "zh"
        ? `AI 录入：${{ new_partner: "新伙伴", powermap: "权力地图", opportunity: "商机", profile: "档案补全", training: "培训", solution: "联合方案", business_record: "商务记录", todo: "待办" }[scope]}`
        : `AI intake: ${scope.replace(/_/g, " ")}`;
    await db.timelineEvent.create({
      data: {
        partnerId,
        type: "AI_SUMMARY",
        title: intakeTitle,
        content: proposal.summary || applied.join(locale === "zh" ? "；" : "; "),
        createdById: userId,
        meta: JSON.stringify({ via: "ai-intake", scope, applied, sourceText: opts.sourceText?.slice(0, 8000) }),
      },
    });
  }

  return { applied, partnerId };
}
