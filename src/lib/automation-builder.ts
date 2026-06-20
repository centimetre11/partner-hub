import { AIError, chatJson } from "./ai";
import { emitPhase, emitReplyChunks, nextTraceId, type TraceEmitter } from "./ai-trace";
import { clarificationSchemaHint, hasRequiredClarifications, normalizeAiClarifications } from "./ai-clarifications";
import { enrichAutomationClarifications, applyUserDeliveryIntent } from "./automation-clarifications";
import type { BuilderDeliveryPrefs } from "./builder-context-prompt";
import {
  pickAutomationTaskMd,
  inferDueWithinDays,
  buildScheduledPushTaskMd,
  defaultAutomationName,
  defaultAutomationSlug,
  partnerScopeLabel,
} from "./automation-push";
import { CRON_PRESETS, describeCron } from "./cron";
import { db } from "./db";
import { listWecomChats } from "./wecom-chats";
import type { Locale } from "./i18n/locale";
import type {
  AutomationBuilderClarification,
  AutomationBuilderDraft,
  AutomationBuilderMessage,
  AutomationBuilderTurn,
} from "./automation-builder-types";

export type {
  AutomationBuilderClarification,
  AutomationBuilderDraft,
  AutomationBuilderMessage,
  AutomationBuilderTurn,
} from "./automation-builder-types";

const DEFAULT_DRAFT: AutomationBuilderDraft = {
  slug: "",
  name: "",
  description: "",
  taskMd: buildScheduledPushTaskMd({ goal: "定时查询并推送", locale: "zh" }),
  triggerType: "SCHEDULE",
  cronExpr: "0 9 * * *",
  timezone: "Asia/Shanghai",
  validityDays: 7,
  variables: [],
  maxIterations: 30,
  timeoutMinutes: 60,
  notifyOnSuccess: true,
  notifyOnFailure: true,
  wecomPushChatId: "",
  webhookUrl: "",
  pushEmailTo: "",
  partnerId: "",
  rationale: "",
  questionnaire: [],
  missingSkillNotes: [],
};

function outputSchema(locale: Locale) {
  const replyLang = locale === "zh" ? "Chinese" : "English";
  return `Output exactly one JSON object. ALL user-visible text fields MUST be in ${replyLang}. draft.slug stays English kebab-case.
{
  "reply": "${replyLang} concise reply",
  "clarifications": [{ "id", "question", "options", "tier": "required|preference" }],
  "questions": [],
  "ready": true/false,
  "draft": {
    "slug": "e.g. acme-opportunities-daily",
    "name": "${replyLang} display name",
    "description": "${replyLang} one-line task goal (REQUIRED)",
    "taskMd": "Optional detailed TASK.md; if empty server uses standard scheduled-push template",
    "triggerType": "SCHEDULE",
    "cronExpr": "0 9 * * *",
    "timezone": "Asia/Shanghai",
    "partnerId": "partner id or empty string for ALL partners",
    "dueWithinDays": "optional number — only for todo/due-date scenarios",
    "wecomPushChatId": "WeCom group chatId",
    "pushEmailTo": "email or empty",
    "notifyOnSuccess": true,
    "notifyOnFailure": true,
    "rationale": "${replyLang} brief",
    "variables": [],
    "questionnaire": [],
    "missingSkillNotes": []
  }
}`;
}

function buildSystemPrompt(locale: Locale) {
  const lang = locale === "zh" ? "Chinese (简体中文)" : "English";
  const cronExamples = CRON_PRESETS.map((p) => `${p.expr} = ${locale === "zh" ? p.labelZh : p.labelEn}`).join("\n");

  return `You are the "Scheduled Partner Push" automation builder in Fanruan Partner Hub.
ONLY create scheduled pipelines: query partner data (or all partners) → format → push to WeCom group and/or email.

Language: ${lang}. draft.slug = English kebab-case.

Example scenarios (same framework):
1. 「每天把这个客户 3 天内过期的待办推送到这个群」→ list_todos + dueWithinDays=3
2. 「每天把这个客户的商机发邮件给我」→ list_opportunities + send_email
3. 「每天搜一下这个客户的投标动态发邮件给我」→ web_search + send_email
4. 「每日科技新闻摘要发邮件」→ partnerId 空 + web_search（无伙伴关联）

Rules:
1. triggerType is always SCHEDULE. Runtime tools: list_todos, list_opportunities, web_search, get_partner, search_partners, push_wecom, send_email.
2. partnerId: if user says「这个伙伴/该客户」without a bound partner in system hint → ready=false and tier:required clarification listing partner names; do NOT assume「无伙伴关联」. Use bound partner when provided. Leave EMPTY only when user wants all/no partner scope.
3. ready=true requires: draft.description, draft.cronExpr, and at least one of wecomPushChatId or pushEmailTo. partnerId is optional (empty = all).
4. 【构建偏好】wins for filled fields; if user text conflicts (e.g.「发到群」while prefs say no WeCom) → follow user intent and emit clarifications to pick the group — do NOT silently skip WeCom.
5. Apply WeCom group chatId ONLY when user/prefs explicitly enable WeCom push — not by default.
6. clarifications tier required for ambiguous partner or WeCom group; tier preference for schedule tweaks.
7. Write taskMd when steps are non-obvious (web_search queries, filters); else leave empty for server template.
8. Do NOT build unrelated pipelines (gold price, generic coding agents).
9. Cron presets:
${cronExamples}

${clarificationSchemaHint(locale)}

${outputSchema(locale)}`;
}

function isDraftReady(draft: AutomationBuilderDraft): boolean {
  if (!draft.cronExpr.trim()) return false;
  if (!draft.description.trim() && !draft.taskMd.trim()) return false;
  if (!draft.wecomPushChatId.trim() && !draft.pushEmailTo.trim()) return false;
  return true;
}

function legacyQuestionOptions(locale: Locale): string[] {
  return locale === "zh"
    ? ["采用当前草案（推荐）", "需要调整", "还不确定"]
    : ["Use current draft (recommended)", "Need changes", "Not sure yet"];
}

function normalizeClarifications(raw: unknown, questions: string[], locale: Locale): AutomationBuilderClarification[] {
  const out = normalizeAiClarifications(raw, { max: 4, defaultTier: "required" });
  if (out.length) return out;
  const qs = questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 4);
  return qs.map((question, i) => ({
    id: `legacy-${i}`,
    question,
    options: legacyQuestionOptions(locale),
  }));
}

function normalizeDraft(raw: Partial<AutomationBuilderDraft>, partnerNameHint?: string, locale: Locale = "zh"): AutomationBuilderDraft {
  let cronExpr = String(raw.cronExpr ?? "0 9 * * *").trim();
  if (!cronExpr) cronExpr = "0 9 * * *";

  const partnerId = String(raw.partnerId ?? "").trim();
  const wecomPushChatId = String(raw.wecomPushChatId ?? "").trim();
  const pushEmailTo = String(raw.pushEmailTo ?? "").trim();
  const description = String(raw.description ?? "").trim();
  const scopeName = partnerNameHint || (partnerId ? "" : partnerScopeLabel(undefined, locale));

  let slug = String(raw.slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug) slug = defaultAutomationSlug(partnerNameHint || description.slice(0, 24));

  let name = String(raw.name ?? "").trim();
  if (!name) name = defaultAutomationName(description || partnerNameHint, locale);

  const goal = description || name;
  const dueWithinDays = inferDueWithinDays(goal, raw.dueWithinDays);
  const taskMdRaw = String(raw.taskMd ?? "").trim();
  const taskMd = pickAutomationTaskMd(
    {
      goal,
      partnerId,
      partnerName: partnerNameHint || scopeName,
      dueWithinDays,
      wecomPushChatId,
      pushEmailTo,
      locale,
    },
    taskMdRaw
  );

  return {
    slug,
    name,
    description: goal,
    taskMd,
    triggerType: "SCHEDULE",
    cronExpr,
    timezone: String(raw.timezone ?? "Asia/Shanghai").trim() || "Asia/Shanghai",
    validityDays: Number.isInteger(raw.validityDays) ? (raw.validityDays as number) : 7,
    variables: [],
    maxIterations: Number.isInteger(raw.maxIterations) ? (raw.maxIterations as number) : 30,
    timeoutMinutes: Number.isInteger(raw.timeoutMinutes) ? (raw.timeoutMinutes as number) : 60,
    notifyOnSuccess: raw.notifyOnSuccess !== false,
    notifyOnFailure: raw.notifyOnFailure !== false,
    wecomPushChatId,
    webhookUrl: "",
    pushEmailTo,
    partnerId,
    dueWithinDays,
    rationale: String(raw.rationale ?? ""),
    questionnaire: [],
    missingSkillNotes: Array.isArray(raw.missingSkillNotes) ? raw.missingSkillNotes.map(String) : [],
  };
}

export function applyAutomationDraftDefaults(
  draft: AutomationBuilderDraft,
  opts: { boundPartnerId?: string; boundPartnerName?: string; sourceChatId?: string }
): AutomationBuilderDraft {
  return normalizeDraft(
    {
      ...draft,
      partnerId: draft.partnerId || opts.boundPartnerId || "",
      wecomPushChatId: draft.wecomPushChatId || opts.sourceChatId || "",
    },
    opts.boundPartnerName,
    "zh"
  );
}

function normalizeTurn(
  raw: Partial<AutomationBuilderTurn>,
  locale: Locale,
  partnerNameHint?: string
): AutomationBuilderTurn {
  const draft = normalizeDraft({ ...DEFAULT_DRAFT, ...(raw.draft ?? {}) }, partnerNameHint, locale);
  const clarifications = normalizeClarifications(raw.clarifications, Array.isArray(raw.questions) ? raw.questions : [], locale);
  const defaultReply =
    locale === "zh"
      ? "我已整理定时推送自动化草案，请确认任务目标、范围（伙伴或全部）与推送渠道。"
      : "I've drafted a scheduled push automation — confirm goal, scope (partner or all), and delivery.";
  return {
    reply: raw.reply?.trim() || defaultReply,
    questions: clarifications.map((c) => c.question),
    clarifications,
    ready: !!raw.ready && isDraftReady(draft) && !hasRequiredClarifications(clarifications),
    draft,
  };
}

function fallbackTurn(locale: Locale, detail: string, partial?: Partial<AutomationBuilderTurn>): AutomationBuilderTurn {
  const draft = normalizeDraft({ ...DEFAULT_DRAFT, ...(partial?.draft ?? {}) }, undefined, locale);
  const reply =
    locale === "zh"
      ? `抱歉，AI 返回格式有误。请继续补充需求或简化描述后重试。\n\n（${detail.slice(0, 120)}）`
      : `Sorry — format error. Please retry.\n\n(${detail.slice(0, 120)})`;
  const questions = Array.isArray(partial?.questions) ? partial!.questions! : [];
  return {
    reply: partial?.reply?.trim() || reply,
    questions,
    clarifications: normalizeClarifications(partial?.clarifications, questions, locale),
    ready: false,
    draft,
  };
}

export async function runAutomationBuilderTurn(opts: {
  messages: AutomationBuilderMessage[];
  userId?: string;
  emit?: TraceEmitter;
  locale?: Locale;
  boundPartnerId?: string;
  boundPartnerName?: string;
  sourceChatId?: string;
  deliveryPrefs?: Partial<BuilderDeliveryPrefs>;
}): Promise<AutomationBuilderTurn> {
  const locale = opts.locale ?? "en";
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 80,
  });
  const partnerLines = partners.map((p) => `${p.id} | ${p.name}`).join("\n") || "(none)";
  const system = `${buildSystemPrompt(locale)}

【Partners — draft.partnerId; empty = ALL partners】
${partnerLines}`;
  const conversation = opts.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const userPrompt =
    locale === "zh"
      ? `对话历史：\n${conversation}\n\n请输出 JSON（定时查询推送自动化）。`
      : `Conversation:\n${conversation}\n\nOutput JSON (scheduled query & push automation).`;

  const reasonId = nextTraceId("reason");
  opts.emit?.({
    event: "trace",
    step: {
      type: "reasoning",
      id: reasonId,
      content: locale === "zh" ? "理解定时推送需求…" : "Planning scheduled push…",
      status: "running",
    },
  });
  emitPhase(opts.emit, "extract", locale === "zh" ? "生成自动化草案" : "Building automation draft");

  try {
    const raw = await chatJson<{
      reply?: string;
      draft?: Partial<AutomationBuilderDraft>;
      clarifications?: unknown;
      questions?: string[];
      ready?: boolean;
    }>(system, userPrompt, {
      temperature: 0.25,
      feature: "automation-builder",
      userId: opts.userId,
    });

    let turn = normalizeTurn(raw as Partial<AutomationBuilderTurn>, locale, opts.boundPartnerName);
    const intentDraft = applyUserDeliveryIntent(
      normalizeDraft({ ...DEFAULT_DRAFT, ...(raw.draft ?? {}) }, opts.boundPartnerName, locale),
      {
        messages: opts.messages,
        deliveryPrefs: opts.deliveryPrefs,
        boundPartnerId: opts.boundPartnerId,
        sourceChatId: opts.sourceChatId,
      }
    );
    turn = {
      ...turn,
      draft: applyAutomationDraftDefaults(intentDraft, {
        boundPartnerId: opts.boundPartnerId,
        boundPartnerName: opts.boundPartnerName,
        sourceChatId: opts.sourceChatId,
      }),
    };

    const effectivePartnerId =
      turn.draft.partnerId.trim() ||
      opts.deliveryPrefs?.partnerId?.trim() ||
      opts.boundPartnerId?.trim() ||
      "";
    const effectiveWecom =
      turn.draft.wecomPushChatId.trim() ||
      opts.deliveryPrefs?.wecomChatId?.trim() ||
      opts.sourceChatId?.trim() ||
      "";
    const effectiveEmail = turn.draft.pushEmailTo.trim() || opts.deliveryPrefs?.email?.trim() || "";

    const wecomChats = (await listWecomChats())
      .filter((c) => c.chatType === "group")
      .map((c) => ({ chatId: c.chatId, label: c.label, partnerName: c.partnerName }));

    const clarifications = enrichAutomationClarifications({
      clarifications: turn.clarifications,
      messages: opts.messages,
      partnerId: effectivePartnerId,
      wecomPushChatId: effectiveWecom,
      pushEmailTo: effectiveEmail,
      partners,
      wecomChats,
      locale,
      boundPartnerId: opts.boundPartnerId,
    });
    turn = {
      ...turn,
      clarifications,
      questions: clarifications.map((c) => c.question),
      ready: isDraftReady({
        ...turn.draft,
        partnerId: effectivePartnerId,
        wecomPushChatId: effectiveWecom,
        pushEmailTo: effectiveEmail,
      }) && !hasRequiredClarifications(clarifications),
    };

    opts.emit?.({
      event: "trace_patch",
      id: reasonId,
      patch: {
        status: "done",
        content:
          locale === "zh"
            ? `草案：${turn.draft.name || "未命名"} · ${describeCron(turn.draft.cronExpr, locale)}`
            : `Draft: ${turn.draft.name || "Untitled"} · ${describeCron(turn.draft.cronExpr, locale)}`,
      },
    });
    emitPhase(opts.emit, "reply", locale === "zh" ? "生成回复" : "Generating reply");
    if (raw.reply) await emitReplyChunks(opts.emit, raw.reply);
    return turn;
  } catch (e) {
    const detail = e instanceof AIError ? e.message : String(e);
    return fallbackTurn(locale, detail);
  }
}
