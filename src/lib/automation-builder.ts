import { AIError, chatJsonStream } from "./ai";
import { emitPhase, emitReplyChunks, nextTraceId, type TraceEmitter } from "./ai-trace";
import { hasRequiredClarifications, normalizeAiClarifications } from "./ai-clarifications";
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
import { describeCron } from "./cron";
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
  "reply": "${replyLang} concise reply (1-2 sentences)",
  "clarifications": [],
  "ready": true/false,
  "intent": {
    "goal": "${replyLang} one-line: what to query and push",
    "dataType": "todos|opportunities|web_search|mixed",
    "partnerScope": "all|named|bound",
    "partnerNameHint": "only when partnerScope=named — partner/customer name substring, NOT id",
    "deliveryChannel": "email|wecom|both|unset",
    "emailRecipient": "mine|unset — mine when user says 我的邮箱/发给我",
    "cronExpr": "0 9 * * *",
    "dueWithinDays": null
  },
  "draft": {
    "slug": "english-kebab-case",
    "name": "${replyLang} display name",
    "description": "same as intent.goal",
    "taskMd": "",
    "cronExpr": "same as intent.cronExpr",
    "timezone": "Asia/Shanghai",
    "partnerId": "",
    "wecomPushChatId": "",
    "pushEmailTo": "",
    "rationale": "${replyLang} brief"
  }
}
Do NOT fill partnerId/wecomPushChatId/pushEmailTo — server resolves from intent + DB.
Do NOT emit clarifications for partner list, email, or WeCom group — server UI handles.
Only clarifications[] when task goal itself is ambiguous (max 1).`;
}

function buildRuntimeContextBlock(
  locale: Locale,
  ctx: {
    partnerCount: number;
    userName?: string;
    userEmail?: string;
    boundPartnerName?: string;
    boundPartnerId?: string;
  }
): string {
  if (locale === "zh") {
    return `【服务端上下文 — 勿注入完整列表，只输出 intent 参数，由服务端查库】
- 非归档伙伴总数: ${ctx.partnerCount}（partnerScope=all 表示查全部）
- 当前用户: ${ctx.userName ?? "—"}${ctx.userEmail ? ` · 邮箱 ${ctx.userEmail}` : " · 无邮箱"}（emailRecipient=mine 时用此邮箱）
- 会话绑定伙伴: ${ctx.boundPartnerName ? `${ctx.boundPartnerName} (${ctx.boundPartnerId})` : "无"}（partnerScope=bound 时用此伙伴）
- 企微群/收件邮箱/伙伴下拉: 由服务端澄清 UI 提供，AI 不要追问或列举`;
  }
  return `【Server context — output intent params only; server resolves IDs from DB】
- Active partners: ${ctx.partnerCount} (partnerScope=all = all partners)
- Current user: ${ctx.userName ?? "—"}${ctx.userEmail ? ` · ${ctx.userEmail}` : ""} (emailRecipient=mine)
- Bound partner: ${ctx.boundPartnerName ? `${ctx.boundPartnerName}` : "none"} (partnerScope=bound)
- WeCom/email/partner pickers: server UI — do NOT ask or list options in clarifications`;
}

function buildSystemPrompt(locale: Locale) {
  const lang = locale === "zh" ? "Chinese (简体中文)" : "English";

  return `You are the Scheduled Partner Push automation builder in Fanruan Partner Hub.
Parse user intent → output JSON with intent.* semantic fields. Server fills IDs, TASK.md, and delivery pickers.

Language: ${lang}. Keep reply and names in ${lang}; draft.slug in English kebab-case.

Examples:
- 「每天早上所有伙伴待办发到我邮箱」→ dataType=todos, partnerScope=all, deliveryChannel=email, emailRecipient=mine, cronExpr=0 9 * * *
- 「每天把 Acme 3 天内过期待办推到群」→ dataType=todos, partnerScope=named, partnerNameHint=Acme, deliveryChannel=wecom, dueWithinDays=3
- 「每周一汇总商机发邮件」→ dataType=opportunities, partnerScope=all, deliveryChannel=email

Rules:
1. triggerType is always SCHEDULE (implicit). Runtime: list_todos, list_opportunities, web_search, push_wecom, send_email.
2. partnerScope: all=全部伙伴; named=用户点了具体名字(填 partnerNameHint); bound=「这个客户」且上下文有绑定伙伴.
3. deliveryChannel + emailRecipient: 用户说清「发邮箱/我的邮箱」→ email + mine; 勿再问渠道.
4. taskMd always "" — server generates TASK.md template.
5. clarifications always [] unless the task goal is completely unclear.
6. ready=true when intent.goal, intent.cronExpr, and deliveryChannel≠unset (or emailRecipient=mine for email).
7. Do NOT build unrelated agents (gold price, generic coding).

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

type AutomationBuilderAiIntent = {
  goal?: string;
  dataType?: string;
  partnerScope?: "all" | "named" | "bound";
  partnerNameHint?: string;
  deliveryChannel?: "email" | "wecom" | "both" | "unset";
  emailRecipient?: "mine" | "unset";
  cronExpr?: string;
  dueWithinDays?: number | null;
};

/** 将 AI 输出的语义 intent 解析为 draft 字段（伙伴/邮箱由服务端查库） */
function applySemanticIntentFromAi(
  draft: AutomationBuilderDraft,
  intent: AutomationBuilderAiIntent | undefined,
  rawDraft: Partial<AutomationBuilderDraft>,
  opts: { partners: { id: string; name: string }[]; boundPartnerId?: string; userEmail?: string }
): AutomationBuilderDraft {
  const goal = intent?.goal?.trim() || rawDraft.description?.trim() || draft.description;
  const cronExpr = intent?.cronExpr?.trim() || rawDraft.cronExpr?.trim() || draft.cronExpr;
  let partnerId = draft.partnerId;
  let pushEmailTo = draft.pushEmailTo;
  let wecomPushChatId = draft.wecomPushChatId;
  const dueWithinDays =
    intent?.dueWithinDays != null && Number.isFinite(intent.dueWithinDays)
      ? Number(intent.dueWithinDays)
      : rawDraft.dueWithinDays;

  const scope = intent?.partnerScope;
  if (scope === "all") partnerId = "";
  else if (scope === "bound" && opts.boundPartnerId) partnerId = opts.boundPartnerId;
  else if (scope === "named" && intent?.partnerNameHint?.trim()) {
    const hint = intent.partnerNameHint.trim().toLowerCase();
    const p = opts.partners.find(
      (x) => x.name.toLowerCase().includes(hint) || hint.includes(x.name.toLowerCase())
    );
    if (p) partnerId = p.id;
  }

  const channel = intent?.deliveryChannel;
  if (channel === "email") {
    if (intent?.emailRecipient === "mine" && opts.userEmail) pushEmailTo = opts.userEmail;
    wecomPushChatId = "";
  } else if (channel === "wecom") {
    pushEmailTo = "";
  }

  return {
    ...draft,
    description: goal,
    cronExpr,
    partnerId,
    pushEmailTo,
    wecomPushChatId,
    dueWithinDays,
    taskMd: "",
  };
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

  let userEmail = "";
  let userName = "";
  if (opts.userId) {
    const me = await db.user.findUnique({ where: { id: opts.userId }, select: { email: true, name: true } });
    userEmail = me?.email?.trim() ?? "";
    userName = me?.name?.trim() ?? "";
  }

  const partnerCount = await db.partner.count({ where: { status: { not: "ARCHIVED" } } });
  const system = `${buildSystemPrompt(locale)}

${buildRuntimeContextBlock(locale, {
  partnerCount,
  userName,
  userEmail,
  boundPartnerName: opts.boundPartnerName,
  boundPartnerId: opts.boundPartnerId,
})}`;
  const conversation = opts.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const userPrompt =
    locale === "zh"
      ? `对话历史：\n${conversation}\n\n请输出 JSON（含 intent 语义参数，勿填 partnerId/邮箱/chatId）。`
      : `Conversation:\n${conversation}\n\nOutput JSON with intent params (no partnerId/email/chatId).`;

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
    const { data: raw, streamed } = await chatJsonStream<{
      reply?: string;
      intent?: AutomationBuilderAiIntent;
      draft?: Partial<AutomationBuilderDraft>;
      clarifications?: unknown;
      questions?: string[];
      ready?: boolean;
    }>(system, userPrompt, {
      temperature: 0.2,
      feature: "automation-builder",
      userId: opts.userId,
      taskTier: "fast",
      maxTokens: 800,
      emit: opts.emit,
    });

    const partners = await db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    });

    let turn = normalizeTurn(raw as Partial<AutomationBuilderTurn>, locale, opts.boundPartnerName);
    const baseDraft = normalizeDraft({ ...DEFAULT_DRAFT, ...(raw.draft ?? {}) }, opts.boundPartnerName, locale);
    const semanticDraft = applySemanticIntentFromAi(baseDraft, raw.intent, raw.draft ?? {}, {
      partners,
      boundPartnerId: opts.boundPartnerId,
      userEmail,
    });
    const intentDraft = applyUserDeliveryIntent(semanticDraft, {
        messages: opts.messages,
        deliveryPrefs: opts.deliveryPrefs,
        boundPartnerId: opts.boundPartnerId,
        sourceChatId: opts.sourceChatId,
        userEmail,
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

    const emailUsers = opts.userId
      ? await db.user.findMany({
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : [];
    const emails = emailUsers
      .filter((u) => u.email)
      .map((u) => ({ id: u.id, name: u.name, email: u.email! }));

    const clarifications = enrichAutomationClarifications({
      clarifications: turn.clarifications,
      messages: opts.messages,
      partnerId: effectivePartnerId,
      wecomPushChatId: effectiveWecom,
      pushEmailTo: effectiveEmail,
      partners,
      wecomChats,
      emails,
      locale,
      boundPartnerId: opts.boundPartnerId,
      userEmail,
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
    if (raw.reply) {
      if (streamed && opts.emit) opts.emit({ event: "reply_reset" });
      await emitReplyChunks(opts.emit, raw.reply);
    }
    return turn;
  } catch (e) {
    const detail = e instanceof AIError ? e.message : String(e);
    return fallbackTurn(locale, detail);
  }
}
