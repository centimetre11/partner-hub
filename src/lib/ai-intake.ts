import { isAgentBuilderIntent } from "./agent-builder-intent";
import { isAutomationBuilderIntent } from "./automation-builder-intent";
import { resolveProposeScope } from "./intake-route-resolver";
import {
  isListTodosAction,
  isProposeBuiltinAction,
  normalizeActionText,
} from "./intake-action-registry";
import { stripIntakeSystemHint, isIntakeParseErrorReply } from "./intake-text";
import { PROPOSE_INTENT_RE } from "./propose-intent";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { recordAiConversation, recordSystemEvent } from "./activity-log";
import { chatCompletion, parseJsonLoose, safeParseJsonLoose, type ChatMessage, type ToolCall } from "./ai";
import type { AiTaskTier } from "./ai-capabilities";
import { maxTokensForTaskTier } from "./ai-capabilities";
import type { LlmScene } from "./llm-scenes";
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
  fieldLabelForScope,
  isCustomerScope,
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
import { CUSTOMER_FIELD_LABELS, PARTNER_FIELD_LABELS, SOLUTION_STATUS_LABELS } from "./constants";

import { ACTIVE_PARTNER_DEFAULTS } from "./partner-onboarding";
import { partnerFieldValueFromText } from "./tier";
import {
  finalizeFastIntakeTurn,
  heuristicFastIntakeTurn,
  lastIntakeUserText,
  primaryIntakeUserText,
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
  buildCustomerBindingPrompt,
  buildPartnerBindingPrompt,
  enrichProposalPartnerFromText,
  intakeScopeRequiresPartner,
  loadIntakePartnerBinding,
  resolveIntakePartner,
  resolveIntakeTodoOwner,
} from "./intake-partner-binding";
import { enrichBusinessRecordCompanyTarget, resolveBusinessRecordCompanyTarget, lookupSingleCustomerByName } from "./business-record-intake";
import { submitBusinessRecordToCrmOnly } from "./crm-business-record";
import { ownerData, ownerWhere, type OwnerRef } from "./owner";
import { isFastIntakeScope, sanitizeProposalForScope } from "./proposal-scope";
import { prefetchParallelWebLinkedinResearch } from "./intake-public-research";
import { normalizeTodoItem, resolveTodoAssigneeId } from "./todo-intake-parse";

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
  /** 新「客户」实体 ID（Partner Hub 维护的终端客户，可独立于伙伴存在） */
  customerId?: string;
  customerName?: string;
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
  /** required = must answer; preference = optional refine (defaults to first option) */
  tier?: "required" | "preference";
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

/** 建档/补全等重任务走 profiling 场景，轻量录入走 fast 场景 */
function intakeScene(scope: IntakeScope): LlmScene {
  return isFastIntakeScope(scope) ? "fast" : "profiling";
}

async function partnerContextForScope(scope: IntakeScope, partnerId: string, locale: Locale): Promise<string> {
  if (scope === "powermap") return powermapContext(partnerId, locale);
  if (scope === "business_record" || scope === "training") return businessRecordContext(partnerId, locale);
  if (isFastIntakeScope(scope)) return intakeBoundPartnerLine(partnerId, locale);
  return partnerContext(partnerId, locale);
}

/** Existing customer record context for customer_profile /补全 scope. */
async function customerContextForIntake(customerId: string, locale: Locale): Promise<string> {
  const c = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      status: true,
      industry: true,
      scale: true,
      city: true,
      country: true,
      website: true,
      notes: true,
      contacts: { select: { id: true, name: true, title: true, department: true, role: true }, take: 30 },
    },
  });
  if (!c) return "";
  const lines: string[] = [];
  const pushIf = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };
  pushIf(locale === "zh" ? "名称" : "Name", c.name);
  pushIf(locale === "zh" ? "状态" : "Status", c.status);
  pushIf(locale === "zh" ? "行业" : "Industry", c.industry);
  pushIf(locale === "zh" ? "规模" : "Scale", c.scale);
  pushIf(locale === "zh" ? "城市" : "City", c.city);
  pushIf(locale === "zh" ? "国家" : "Country", c.country);
  pushIf(locale === "zh" ? "官网" : "Website", c.website);
  pushIf(locale === "zh" ? "备注" : "Notes", c.notes);
  if (c.contacts.length) {
    const people = c.contacts
      .map((p) => [p.name, p.title, p.department].filter(Boolean).join(" / "))
      .join("; ");
    lines.push((locale === "zh" ? "现有联系人: " : "Existing contacts: ") + people);
  }
  const header = locale === "zh" ? `[客户档案：${c.name}]` : `[Customer profile: ${c.name}]`;
  return `${header}\n${lines.join("\n")}`;
}

/** Call LLM for JSON extraction; streams reply_delta when emit is set */
async function callIntakeExtract(
  chat: ChatMessage[],
  opts: { feature: string; userId?: string; taskTier: AiTaskTier; scene?: LlmScene; emit?: TraceEmitter; streamFast?: boolean },
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
      scene: opts.scene,
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
    const tier =
      c.tier === "required" || c.tier === "preference"
        ? c.tier
        : c.blocking === false
          ? "preference"
          : isTodoPartnerNotFound || isIdentity || c.blocking === true
            ? "required"
            : kind === "field"
              ? "preference"
              : "required";
    out.push({
      id,
      question: c.question.trim(),
      options,
      multi: !!c.multi,
      allowOther: c.allowOther !== false,
      apply: c.apply === "direct" || c.apply === "ai" ? c.apply : undefined,
      kind: isIdentity ? "identity" : kind,
      tier,
      blocking: tier === "required",
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

/** When LLM fills summary but omits businessRecords, derive one record for CRM sync. */
function backfillBusinessRecordsFromSummary(proposal: Partial<IntakeProposal>): Partial<IntakeProposal> {
  const records = proposal.businessRecords ?? [];
  const summary = asTrimmedString(proposal.summary);
  if (records.length > 0 || !summary) return proposal;
  const title = summary.length > 60 ? `${summary.slice(0, 57)}…` : summary;
  return {
    ...proposal,
    businessRecords: [{ title, content: summary, category: "OTHER" }],
  };
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
  opts?: { partnerId?: string; customerId?: string; userText?: string; primaryUserText?: string },
): Promise<IntakeTurn> {
  let proposal = turn.proposal;
  if (scope === "business_record") {
    proposal = await enrichBusinessRecordCompanyTarget(
      proposal,
      opts?.primaryUserText?.trim() || opts?.userText || "",
      opts?.partnerId,
      opts?.customerId,
    );
  } else if (!opts?.partnerId && !opts?.customerId && opts?.userText) {
    const { enrichProposalPartnerFromText } = await import("./intake-partner-binding");
    proposal = await enrichProposalPartnerFromText(proposal, opts.userText, opts?.partnerId);
  }
  let next = { ...turn, proposal };
  if (scope === "new_partner") {
    const { pruneRedundantIdentityClarifications } = await import("./clarification-apply");
    next = pruneRedundantIdentityClarifications(next, scope);
  }
  return isFastIntakeScope(scope)
    ? await finalizeFastIntakeTurn(scope, next, locale, {
        boundPartnerId: opts?.partnerId,
        boundCustomerId: opts?.customerId,
        userText: opts?.userText,
        primaryUserText: opts?.primaryUserText,
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
    scene?: LlmScene;
    today?: string;
    partnerId?: string;
    customerId?: string;
  }
): Promise<IntakeTurn> {
  const userText = lastIntakeUserText(opts?.chat, scope);
  const primaryUserText = scope === "business_record" ? primaryIntakeUserText(opts?.chat, scope) : userText;
  const finalizeOpts = { partnerId: opts?.partnerId, customerId: opts?.customerId, userText, primaryUserText };

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
        scene: opts.scene,
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
  const finalized = await finalizeIntakeTurn(fallback, scope, locale, finalizeOpts);
  if (
    isFastIntakeScope(scope) &&
    countProposalItems(finalized.proposal) > 0 &&
    isIntakeParseErrorReply(finalized.reply)
  ) {
    const { heuristicReply } = await import("./fast-intake-heuristic");
    return { ...finalized, reply: heuristicReply(locale, scope) };
  }
  return finalized;
}

function normalizeIntakeTurn(raw: Partial<IntakeTurn>, locale: Locale, scope: IntakeScope): IntakeTurn {
  const p: Partial<IntakeProposal> =
    scope === "business_record" ? backfillBusinessRecordsFromSummary(raw.proposal ?? {}) : (raw.proposal ?? {});
  const customerScope = isCustomerScope(scope);
  const allowedFields = customerScope ? CUSTOMER_FIELD_LABELS : PARTNER_FIELD_LABELS;
  const coerceField = (f: FieldUpdate): FieldUpdate => ({
    ...f,
    label: fieldLabelForScope(locale, scope, f.field) || f.label,
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
      customerId: p.customerId == null ? undefined : asTrimmedString(p.customerId),
      customerName: p.customerName == null ? undefined : asTrimmedString(p.customerName),
      crmCustomerId: p.crmCustomerId == null ? undefined : asTrimmedString(p.crmCustomerId),
      crmCustomerName: p.crmCustomerName == null ? undefined : asTrimmedString(p.crmCustomerName),
      saveMode: p.saveMode === "crm_only" ? "crm_only" : p.saveMode === "both" ? "both" : undefined,
      summary: asTrimmedString(p.summary),
      fields: customerScope
        ? (p.fields ?? []).filter((f) => f.field in allowedFields).map(coerceField)
        : normalizeFieldUpdateLabels(
            (p.fields ?? []).filter((f) => f.field in allowedFields && f.field !== "industry").map(coerceField),
            locale,
          ),
      contacts: p.contacts ?? [],
      opportunities: p.opportunities ?? [],
      todos: (p.todos ?? []).map((t) => {
        const row = normalizeTodoItem(
          {
            title: asTrimmedString(t.title),
            detail: t.detail == null ? undefined : asTrimmedString(t.detail),
            dueDate: t.dueDate == null ? undefined : asTrimmedString(t.dueDate),
            priority: t.priority == null ? undefined : asTrimmedString(t.priority),
            assigneeName: t.assigneeName == null ? undefined : asTrimmedString(t.assigneeName),
          },
          new Date().toISOString().slice(0, 10),
        );
        return row;
      }).filter((t) => t.title),
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
  if (scope === "todo") {
    const first = turn.proposal.todos[0];
    if (first?.title && /待办|todo|负责人|assignee/i.test(turn.proposal.summary)) {
      turn.proposal.summary = first.title;
    } else if (first?.title && !turn.proposal.summary.trim()) {
      turn.proposal.summary = first.title;
    }
  }
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
  customerId?: string,
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
  const scene = intakeScene(scope);
  let content: string | null;
  try {
    ({ content } = await chatCompletion(extractChat, {
      jsonMode: true,
      temperature: 0.3,
      feature,
      userId,
      scene,
    }));
  } catch {
    extractChat[0].content = (extractChat[0].content ?? "") + "\n\nYou must output one valid JSON object only.";
    ({ content } = await chatCompletion(extractChat, {
      temperature: 0.3,
      feature,
      userId,
      scene,
    }));
  }
  const turn = await parseIntakeTurnFromContent(content ?? "", locale, scope, {
    chat: extractChat,
    feature,
    userId,
    scene,
    partnerId,
    customerId,
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
  /** 客户实体 ID（客户建档/补全时使用） */
  customerId?: string;
  messages: IntakeMessage[];
  today: string;
  userId?: string;
  emit?: TraceEmitter;
  locale: Locale;
  /** 已确认草稿（续聊时注入，让模型在草稿上打补丁而非重抽） */
  draft?: IntakeProposal;
  /** 由 runProposeTurn / runAssistantTurn 调用时跳过，避免重复记录 */
  skipConversationLog?: boolean;
}): Promise<IntakeTurn> {
  const started = Date.now();
  const userMessage =
    [...opts.messages].reverse().find((m) => m.role === "user")?.content?.trim() || "（空消息）";
  const feature = `AI intake: ${opts.scope}`;
  try {
    const turn = await runIntakeTurnCore(opts);
    if (!opts.skipConversationLog) {
      void recordAiConversation({
        userId: opts.userId,
        channel: "WEB",
        feature,
        mode: "intake",
        userMessage,
        assistantReply: turn.reply,
        partnerId: opts.partnerId,
        durationMs: Date.now() - started,
        meta: { scope: opts.scope, ready: turn.ready },
      });
    }
    return turn;
  } catch (e) {
    if (!opts.skipConversationLog) {
      void recordAiConversation({
        userId: opts.userId,
        channel: "WEB",
        feature,
        mode: "intake",
        userMessage,
        partnerId: opts.partnerId,
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - started,
      });
    }
    throw e;
  }
}

/** Scope → the proposal array the model edits, for the draft-state block. */
const DRAFT_ARRAY_KEY: Partial<Record<IntakeScope, keyof IntakeProposal>> = {
  business_record: "businessRecords",
  todo: "todos",
  opportunity: "opportunities",
  powermap: "contacts",
  training: "trainings",
  solution: "solutions",
};

/** Compact JSON of the current draft (scope-relevant fields only) for prompt injection. */
function serializeDraftForPrompt(
  proposal: IntakeProposal | undefined,
  scope: IntakeScope,
): string | undefined {
  if (!proposal) return undefined;
  const key = DRAFT_ARRAY_KEY[scope];
  if (!key) return undefined;
  const arr = proposal[key] as unknown[] | undefined;
  if (!arr?.length) return undefined;
  const pick: Record<string, unknown> = { [key]: arr };
  if (proposal.partnerName) pick.partnerName = proposal.partnerName;
  if (proposal.customerName) pick.customerName = proposal.customerName;
  if (proposal.summary) pick.summary = proposal.summary;
  return JSON.stringify(pick);
}

async function runIntakeTurnCore(opts: {
  scope: IntakeScope;
  partnerId?: string;
  customerId?: string;
  messages: IntakeMessage[];
  today: string;
  userId?: string;
  emit?: TraceEmitter;
  locale: Locale;
  draft?: IntakeProposal;
}): Promise<IntakeTurn> {
  const locale = opts.locale;
  const customerScope = isCustomerScope(opts.scope);
  const fast = isFastIntakeScope(opts.scope);
  let taxonomyHint = "";
  if (!fast && !customerScope) {
    const [categoryList, industryList, archetypeList, valuePatternList] = await Promise.all([
      taxonomyListForAi("CATEGORY"),
      taxonomyListForAi("INDUSTRY"),
      taxonomyListForAi("ARCHETYPE"),
      taxonomyListForAi("VALUE_PATTERN"),
    ]);
    taxonomyHint = `Taxonomy values (from library; industries is JSON array, multi-select OK): category=${categoryList}; industries=${industryList}; partnerArchetype=${archetypeList}; valuePattern=${valuePatternList}`;
  }
  let partnerCtx = "";
  const binding = await loadIntakePartnerBinding(customerScope ? undefined : opts.partnerId);
  if (customerScope) {
    if (opts.customerId) partnerCtx = await customerContextForIntake(opts.customerId, locale);
  } else if (
    opts.customerId &&
    (opts.scope === "powermap" || opts.scope === "todo" || opts.scope === "business_record")
  ) {
    partnerCtx = await customerContextForIntake(opts.customerId, locale);
  } else if (opts.partnerId) {
    partnerCtx = await partnerContextForScope(opts.scope, opts.partnerId, locale);
  }

  const enrichmentSkills = intakeEnrichmentSkillsForScope(opts.scope);
  const useResearch = !fast && enrichmentSkills.length > 0 && !!opts.userId;
  const kmsConfigured = useResearch ? await isKmsConfiguredForUser(opts.userId) : false;
  const knowhowConfigured = useResearch ? await isKnowhowConfigured() : false;

  let bindingBlock = "";
  if (customerScope) {
    bindingBlock = "";
  } else if (opts.scope === "powermap" && opts.customerId) {
    const cust = await db.customer.findUnique({ where: { id: opts.customerId }, select: { name: true } });
    if (cust) {
      bindingBlock =
        locale === "zh"
          ? `[客户绑定 · 已锁定]\n当前录入会话已绑定客户「${cust.name}」。联系人将添加到该客户的权力地图；不要追问属于哪家公司。\n信息足够时 ready=true（系统将自动保存，无需用户确认）。`
          : `[Customer binding · locked]\nThis session is bound to customer "${cust.name}". Contacts will be added to this customer's power map.\nSet ready=true when extraction is complete (system auto-saves).`;
    }
  } else if (
    opts.customerId &&
    (opts.scope === "todo" || opts.scope === "business_record")
  ) {
    const cust = await db.customer.findUnique({
      where: { id: opts.customerId },
      select: { id: true, name: true },
    });
    if (cust) {
      bindingBlock = buildCustomerBindingPrompt({
        locale,
        scope: opts.scope,
        customerName: cust.name,
        customerId: cust.id,
      });
    }
  } else {
    bindingBlock = buildPartnerBindingPrompt({ locale, scope: opts.scope, binding });
  }
  const currentDraft = serializeDraftForPrompt(opts.draft, opts.scope);
  let assigneeHint = "";
  if (fast && opts.scope === "todo") {
    const { formatHubAssigneeHint, listHubAssigneeNames } = await import("./hub-assignee-names");
    const names = await listHubAssigneeNames();
    assigneeHint = formatHubAssigneeHint(locale, names);
  }
  const system = fast
    ? buildFastIntakeSystemPrompt({
        locale,
        scope: opts.scope,
        today: opts.today,
        partnerContext: partnerCtx || undefined,
        partnerBinding: bindingBlock,
        assigneeHint: assigneeHint || undefined,
        currentDraft,
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
        currentDraft,
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
            ? `[系统已自动读取 KMS，以下内容可直接用于建档，勿说 KMS 未配置。若 KMS 中公司名与官网明确且唯一，直接写入 proposal，无需 blocking 身份确认；仅在名称/官网存在多个候选或 search_partners 有重复时才发出 identity 澄清。]\n\n${kmsPrefetch.content}`
            : `[System pre-fetched KMS — use directly for onboarding; do NOT say KMS is unconfigured. If KMS gives a clear unique company name and website, write them to proposal without blocking identity clarifications; only emit identity clarifications when multiple name/website candidates exist or search_partners finds duplicates.]\n\n${kmsPrefetch.content}`,
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

    const parallelPublic = await prefetchParallelWebLinkedinResearch({
      scope: opts.scope,
      userText,
      kmsContent: kmsPrefetch?.ok ? kmsPrefetch.content : undefined,
      locale,
      userId: opts.userId,
      emit: opts.emit,
    });
    if (parallelPublic) {
      chat.push({ role: "user", content: parallelPublic.injectionMessage });
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
      executeTool: (tc) => {
        const toolName = tc.function.name;
        if (parallelPublic?.skipToolNames.has(toolName)) {
          return Promise.resolve(
            locale === "zh"
              ? `[已跳过] ${toolName} 结果已在调研开始时并行预取，请使用上文注入的 web_search / linkedin_search 内容。`
              : `[Skipped] ${toolName} was already pre-fetched in parallel at research start — use the injected results above.`
          );
        }
        return runIntakeToolCall(tc, opts.userId);
      },
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
        scene: intakeScene(opts.scope),
        partnerId: opts.partnerId,
        customerId: opts.customerId,
      });
      if (turn.proposal.summary || turn.proposal.partnerName || countProposalItems(turn.proposal) > 0) {
        emitProposalUpdate(opts.emit, turn);
        await emitReplyChunks(opts.emit, turn.reply);
        return turn;
      }
    }
    return extractIntakeJson(chat, feature, locale, opts.scope, opts.userId, opts.emit, opts.partnerId, opts.customerId);
  }

  emitPhase(opts.emit, "extract", "Building proposal");
  const taskTier = intakeTaskTier(opts.scope);
  const scene = intakeScene(opts.scope);
  const content = await callIntakeExtract(chat, {
    feature,
    userId: opts.userId,
    taskTier,
    scene,
    emit: opts.emit,
    streamFast: false,
  });
  const turn = await parseIntakeTurnFromContent(content ?? "", locale, opts.scope, {
    chat,
    feature,
    userId: opts.userId,
    taskTier,
    scene,
    today: opts.today,
    partnerId: opts.partnerId,
    customerId: opts.customerId,
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

export { stripIntakeSystemHint } from "./intake-text";
export { isListTodosAction as isTodoListQueryIntent } from "./intake-action-registry";
export {
  isProposeBuiltinAction,
  isQueryBuiltinAction,
  normalizeActionText,
} from "./intake-action-registry";

/** Detect propose-confirm mode (collaborative agents: onboarding, records, opportunities, etc.) */
export function shouldUseProposeMode(messages: IntakeMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser && isListTodosAction(lastUser.content)) return false;
  if (lastUser && isAgentBuilderIntent(lastUser.content)) return false;
  if (lastUser && isAutomationBuilderIntent(lastUser.content)) return false;
  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => normalizeActionText(m.content))
    .join("\n");
  return isProposeBuiltinAction(text) || PROPOSE_INTENT_RE.test(text);
}

export { detectProposeScope } from "./intake-route-resolver";

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
  partnerName?: string;
  customerId?: string;
  customerName?: string;
  userId?: string;
  emit?: TraceEmitter;
  /** Explicit scope from UI — skips AI classification */
  scope?: IntakeScope;
  /** Prior turn scope — hint for AI continuity, not a hard lock */
  previousScope?: IntakeScope;
  locale: Locale;
  /** Confirmed draft so far — injected so follow-ups patch instead of re-extract */
  draft?: IntakeProposal;
}): Promise<ProposeTurn> {
  const scope = await resolveProposeScope({
    messages: opts.messages,
    partnerId: opts.partnerId,
    partnerName: opts.partnerName,
    userId: opts.userId,
    locale: opts.locale,
    forcedScope: opts.scope,
    previousScope: opts.previousScope,
  });
  const turn = await runIntakeTurn({
    scope,
    partnerId: opts.partnerId,
    customerId: opts.customerId,
    messages: opts.messages,
    today: new Date().toISOString().slice(0, 10),
    userId: opts.userId,
    emit: opts.emit,
    locale: opts.locale,
    draft: opts.draft,
    skipConversationLog: true,
  });
  return { ...turn, scope, mode: "propose" };
}

// ============ Apply intake proposal (after human confirm) ============

const VALID_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];

async function applyCustomerContacts(
  customerId: string,
  contacts: IntakeProposal["contacts"],
  locale: Locale,
): Promise<string[]> {
  const applied: string[] = [];
  const contactIdByName = new Map<string, string>();

  for (const c of contacts) {
    const name = asTrimmedString(c.name);
    if (!name) continue;
    const payload = {
      name,
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
      (c.action === "update" && c.id && (await db.contact.findFirst({ where: { id: c.id, customerId } }))) ||
      (await db.contact.findFirst({ where: { customerId, name } }));
    let savedId: string;
    if (existing) {
      await db.contact.update({ where: { id: existing.id }, data: clean });
      savedId = existing.id;
      applied.push(applyContactUpdated(locale, name));
    } else {
      const created = await db.contact.create({ data: { customerId, ...clean, name } });
      savedId = created.id;
      applied.push(applyContactAdded(locale, name));
    }
    contactIdByName.set(name, savedId);
  }

  for (const c of contacts) {
    if (!c.reportsToName) continue;
    const subName = asTrimmedString(c.name);
    const subId = subName ? contactIdByName.get(subName) : undefined;
    if (!subId) continue;
    let bossId = contactIdByName.get(c.reportsToName);
    if (!bossId) {
      const boss = await db.contact.findFirst({
        where: { customerId, name: { contains: c.reportsToName }, NOT: { name: subName } },
      });
      bossId = boss?.id;
    }
    if (bossId && bossId !== subId) {
      await db.contact.update({ where: { id: subId }, data: { reportsToId: bossId } });
    }
  }

  return applied;
}

function parseOptionalDate(raw: unknown): Date | undefined {
  const s = asTrimmedString(raw);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const CUSTOMER_STATUSES = ["ACTIVE", "PROSPECT", "INACTIVE"];

function normalizeCustomerStatus(raw: unknown): string | undefined {
  const v = asTrimmedString(raw).toUpperCase();
  return CUSTOMER_STATUSES.includes(v) ? v : undefined;
}

/** Apply a customer intake proposal: write to the Customer entity + power-map contacts. */
async function applyCustomerIntake(opts: {
  scope: IntakeScope;
  customerId?: string;
  partnerId?: string;
  proposal: IntakeProposal;
  userId: string;
  locale: Locale;
  sourceText?: string;
}): Promise<{ applied: string[]; partnerId: string; customerId: string }> {
  const { proposal, userId, locale } = opts;
  const applied: string[] = [];

  // Map proposal.fields → Customer columns (customer field codes only)
  const data: Record<string, unknown> = {};
  for (const f of proposal.fields) {
    const field = f.field;
    if (!(field in CUSTOMER_FIELD_LABELS) || field === "name") continue;
    const value = asTrimmedString(f.newValue);
    if (!value) continue;
    if (field === "status") {
      const status = normalizeCustomerStatus(value);
      if (status) data.status = status;
    } else {
      data[field] = value;
    }
    applied.push(applyFieldMessage(locale, f.label || fieldLabelForScope(locale, opts.scope, field), value));
  }

  const proposedName = asTrimmedString(
    proposal.partnerName || proposal.customerName || proposal.fields.find((f) => f.field === "name")?.newValue || ""
  );

  let customerId = opts.customerId ?? "";
  if (customerId) {
    if (proposedName) data.name = proposedName;
    await db.customer.update({ where: { id: customerId }, data });
    applied.push(locale === "zh" ? "已更新客户档案" : "Updated customer profile");
  } else {
    if (!proposedName) throw new Error(locale === "zh" ? "请提供客户名称" : "Customer name is required");
    const created = await db.customer.create({
      data: {
        name: proposedName,
        status: (data.status as string) ?? "PROSPECT",
        createdById: userId,
        industry: (data.industry as string) ?? null,
        scale: (data.scale as string) ?? null,
        city: (data.city as string) ?? null,
        country: (data.country as string) ?? null,
        website: (data.website as string) ?? null,
        contactName: (data.contactName as string) ?? null,
        contactTitle: (data.contactTitle as string) ?? null,
        contactPhone: (data.contactPhone as string) ?? null,
        contactEmail: (data.contactEmail as string) ?? null,
        notes: (data.notes as string) ?? null,
        ...(opts.partnerId
          ? { partnerLinks: { create: { partnerId: opts.partnerId, relation: "SERVED_BY" } } }
          : {}),
      },
    });
    customerId = created.id;
    applied.push(locale === "zh" ? `已创建客户：${created.name}` : `Created customer: ${created.name}`);
  }

  // Power-map contacts (attach to the customer)
  if (proposal.contacts.length) {
    applied.push(...(await applyCustomerContacts(customerId, proposal.contacts, locale)));
  }

  await db.timelineEvent.create({
    data: {
      customerId,
      type: opts.customerId ? "AI_SUMMARY" : "SYSTEM",
      title: opts.customerId
        ? locale === "zh"
          ? "AI 客户档案补全"
          : "AI customer profile update"
        : locale === "zh"
          ? "AI 客户建档"
          : "AI customer onboarding",
      content: proposal.summary || applied.join(locale === "zh" ? "；" : "; "),
      createdById: userId,
      meta: JSON.stringify({ via: "ai-intake", scope: opts.scope, applied, sourceText: opts.sourceText?.slice(0, 8000) }),
    },
  });

  void recordSystemEvent({
    category: "CUSTOMER",
    action: opts.customerId ? "customer.ai_update" : "customer.ai_create",
    actorId: userId,
    targetType: "Customer",
    targetId: customerId,
    summary: opts.customerId
      ? locale === "zh"
        ? "AI 补全客户档案"
        : "AI customer profile update"
      : locale === "zh"
        ? "AI 建档新客户"
        : "AI customer onboarding",
    detail: applied.join(locale === "zh" ? "；" : "; "),
    meta: { scope: opts.scope, applied },
  });

  return { applied, partnerId: opts.partnerId ?? "", customerId };
}

/**
 * 商机/带单等必须挂在「客户」名下。伙伴自营时，复用（或按需创建）该伙伴的 SELF 客户档案。
 */
async function findOrCreateSelfCustomerId(partnerId: string, userId: string): Promise<string> {
  const existing = await db.customer.findFirst({
    where: { partnerRelation: "SELF", partnerLinks: { some: { partnerId } } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { name: true, city: true, country: true, website: true, crmCustomerId: true, kmsRootPath: true },
  });
  if (!partner) throw new Error("伙伴不存在，无法生成自营客户档案");
  const created = await db.customer.create({
    data: {
      name: partner.name,
      status: "ACTIVE",
      partnerRelation: "SELF",
      city: partner.city,
      country: partner.country,
      website: partner.website,
      crmCustomerId: partner.crmCustomerId,
      kmsRootPath: partner.kmsRootPath,
      createdById: userId,
      partnerLinks: { create: { partnerId, relation: "SELF" } },
    },
    select: { id: true },
  });
  return created.id;
}

/** 解析商机的客户归属：绑定客户 → 伙伴自营SELF客户 → 按公司名匹配客户。 */
async function resolveOpportunityCustomerId(opts: {
  boundCustomerId?: string;
  partnerId?: string;
  partnerName?: string;
  userId: string;
}): Promise<string | null> {
  if (opts.boundCustomerId) return opts.boundCustomerId;
  if (opts.partnerId) return findOrCreateSelfCustomerId(opts.partnerId, opts.userId);
  const name = opts.partnerName?.trim();
  if (name) {
    const match = await lookupSingleCustomerByName(name);
    if (match) return match.id;
  }
  return null;
}

export async function applyIntake(opts: {
  scope: IntakeScope;
  partnerId?: string;
  /** 已绑定的「客户」实体（企微群绑定客户 / 客户详情页录入时） */
  customerId?: string;
  proposal: IntakeProposal;
  userId: string;
  sourceText?: string;
  /** active: onboard from Active Partners page as ACTIVE; default is PROSPECT */
  intent?: "prospect" | "active";
  locale: Locale;
}): Promise<{ applied: string[]; partnerId: string; customerId?: string }> {
  const { scope, userId, locale } = opts;
  const proposal = sanitizeProposalForScope(scope, opts.proposal);

  if (scope === "powermap" && opts.customerId) {
    const customerId = opts.customerId;
    const applied = await applyCustomerContacts(customerId, proposal.contacts, locale);
    if (applied.length) {
      await db.timelineEvent.create({
        data: {
          customerId,
          type: "AI_SUMMARY",
          title: locale === "zh" ? "AI 添加联系人" : "AI contact intake",
          content: proposal.summary || applied.join(locale === "zh" ? "；" : "; "),
          createdById: userId,
          meta: JSON.stringify({ via: "ai-intake", scope, applied, sourceText: opts.sourceText?.slice(0, 8000) }),
        },
      });
      void recordSystemEvent({
        category: "CUSTOMER",
        action: "customer.ai_update",
        actorId: userId,
        targetType: "Customer",
        targetId: customerId,
        summary: locale === "zh" ? "AI 添加客户联系人" : "AI customer contact intake",
        detail: applied.join(locale === "zh" ? "；" : "; "),
        meta: { scope, applied },
      });
    }
    revalidatePath(`/customers/${customerId}`);
    return { applied, partnerId: "", customerId };
  }

  if (isCustomerScope(scope)) {
    return applyCustomerIntake({
      scope,
      customerId: opts.customerId,
      partnerId: opts.partnerId,
      proposal,
      userId,
      locale,
      sourceText: opts.sourceText,
    });
  }

  const applied: string[] = [];
  let partnerId = opts.partnerId ?? "";
  let customerId = opts.customerId ?? "";
  /** 商务记录归属对象：伙伴或客户实体（CRM-only 模式下为 null） */
  let businessRecordOwner: OwnerRef | null = null;

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
      if (f.field === "industries") {
        const norm = normalizeIndustriesInput(f.newValue);
        data.industries = norm.industries;
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
  } else if (scope === "business_record") {
    if (proposal.saveMode === "crm_only" && proposal.crmCustomerId) {
      partnerId = "";
    } else {
      const target = await resolveBusinessRecordCompanyTarget({
        proposal,
        boundPartnerId: opts.partnerId,
        boundCustomerId: opts.customerId,
        saveMode: proposal.saveMode,
      });
      const resolvedPartnerId = opts.partnerId || target.hubPartnerId;
      const resolvedCustomerId = opts.customerId || target.customerId || proposal.customerId;
      if (resolvedPartnerId) {
        partnerId = resolvedPartnerId;
        businessRecordOwner = { kind: "partner", id: resolvedPartnerId };
      } else if (resolvedCustomerId) {
        partnerId = "";
        businessRecordOwner = { kind: "customer", id: resolvedCustomerId };
      }
    }
  } else if (scope === "todo") {
    const resolved = await resolveIntakeTodoOwner({
      boundPartnerId: opts.partnerId,
      boundCustomerId: opts.customerId,
      proposal,
      locale,
    });
    if (!resolved.ok) throw new Error(resolved.error);
    partnerId = resolved.partnerId;
    customerId = resolved.customerId || customerId;
  } else if (intakeScopeRequiresPartner(scope)) {
    const resolved = await resolveIntakePartner({
      scope,
      boundPartnerId: opts.partnerId,
      proposal,
      locale,
    });
    if (!resolved.ok) throw new Error(resolved.error);
    partnerId = resolved.partnerId;
  }

  if (intakeScopeRequiresPartner(scope) && !partnerId) {
    const crmOnlyOk =
      scope === "business_record" && proposal.saveMode === "crm_only" && !!proposal.crmCustomerId;
    const customerOwnerOk = scope === "business_record" && businessRecordOwner?.kind === "customer";
    if (!crmOnlyOk && !customerOwnerOk) {
      throw new Error(
        locale === "zh"
          ? "无法确定所属伙伴/客户，请说明公司名称或在伙伴/客户详情页 · 已绑定企微群中录入"
          : "Could not determine the partner/customer — name the company or use a partner/customer page / bound WeCom group"
      );
    }
  }

  // ---- Profile fields (non-onboarding) ----
  if (scope !== "new_partner" && partnerId && proposal.fields.length) {
    const data: Record<string, unknown> = {};
    for (const f of proposal.fields) {
      if (f.field === "name" || !(f.field in PARTNER_FIELD_LABELS)) continue;
      if (f.field === "industries") {
        const norm = normalizeIndustriesInput(f.newValue);
        data.industries = norm.industries;
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

  // ---- Opportunities (商机以客户为主体；伙伴自营时挂其 SELF 客户) ----
  if (scope !== "new_partner" && proposal.opportunities.length) {
    const oppCustomerId = await resolveOpportunityCustomerId({
      boundCustomerId: opts.customerId,
      partnerId,
      partnerName: proposal.partnerName,
      userId,
    });
    if (!oppCustomerId) {
      throw new Error(
        locale === "zh"
          ? "商机需归属客户：未能确定客户，请说明客户公司名或在客户详情页 · 已绑定企微群中录入"
          : "Opportunities must belong to a customer — name the customer company or use a customer page / bound WeCom group"
      );
    }
    const oppOwner: OwnerRef = { kind: "customer", id: oppCustomerId };
    const oppWhere = ownerWhere(oppOwner);
    for (const o of proposal.opportunities) {
      const payload = {
        name: o.name,
        client: o.client,
        amount: o.amount,
        stage: o.stage ?? "Needs Discovery",
        nextStep: o.nextStep,
        status: o.status ?? "ACTIVE",
        notes: o.notes,
        dealType: o.dealType && ["PROJECT", "PRODUCT"].includes(o.dealType) ? o.dealType : undefined,
      };
      const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null));
      const existing =
        (o.action === "update" && o.id && (await db.opportunity.findFirst({ where: { id: o.id, ...oppWhere } }))) ||
        (await db.opportunity.findFirst({ where: { ...oppWhere, name: o.name } }));
      if (existing) {
        await db.opportunity.update({ where: { id: existing.id }, data: clean });
        applied.push(applyOpportunityUpdated(locale, o.name));
      } else {
        await db.opportunity.create({ data: { ...ownerData(oppOwner), ...clean, name: o.name } });
        applied.push(applyOpportunityAdded(locale, o.name));
      }
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

    const recordOwner: OwnerRef | null =
      businessRecordOwner ?? (partnerId ? { kind: "partner", id: partnerId } : null);
    if (!recordOwner) {
      throw new Error(
        locale === "zh"
          ? "未找到 Partner Hub 伙伴/客户；若仅在 CRM 有该客户，请回复「仅CRM」"
          : 'Partner/customer not found in Partner Hub — reply「仅CRM」if it exists in CRM only'
      );
    }

    let contactId: string | null = null;
    if (r.contactName) {
      const contact = await db.contact.findFirst({
        where: { ...ownerWhere(recordOwner), name: { contains: r.contactName } },
      });
      contactId = contact?.id ?? null;
    }
    await persistBusinessRecord({
      owner: recordOwner,
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

  // ---- Todos (not during partner/customer onboarding — use todo scope instead) ----
  if (scope !== "new_partner" && scope !== "new_customer") {
    for (const t of proposal.todos) {
      const title = asTrimmedString(t.title);
      if (!title) continue;
      const assigneeId = await resolveTodoAssigneeId(t.assigneeName, userId);
      await db.todoItem.create({
        data: {
          title,
          detail: t.detail,
          partnerId: partnerId || null,
          customerId: customerId || null,
          assigneeId,
          dueDate: parseOptionalDate(t.dueDate),
          priority: t.priority && ["HIGH", "MEDIUM", "LOW"].includes(t.priority) ? t.priority : "MEDIUM",
          source: "AI",
        },
      });
      applied.push(applyTodoAdded(locale, title));
    }
  }

  // ---- Timeline audit (non-onboarding; onboarding already logged) ----
  if (scope !== "new_partner" && scope !== "business_record" && scope !== "todo" && partnerId) {
    const intakeTitle =
      locale === "zh"
        ? `AI 录入：${{ new_partner: "新伙伴", powermap: "权力地图", opportunity: "商机", profile: "档案补全", training: "培训", solution: "联合方案", business_record: "商务记录", todo: "待办", new_customer: "新客户", customer_profile: "客户档案补全" }[scope]}`
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

  void recordSystemEvent({
    category: "AI",
    action: "intake.apply",
    actorId: userId,
    targetType: partnerId ? "Partner" : undefined,
    targetId: partnerId || undefined,
    summary: locale === "zh" ? `AI 录入已确认（${scope}）` : `AI intake applied (${scope})`,
    detail: applied.join(locale === "zh" ? "；" : "; "),
    meta: { scope, applied },
  });

  return { applied, partnerId, customerId: customerId || undefined };
}

export { PROPOSE_INTENT_RE } from "./propose-intent";
