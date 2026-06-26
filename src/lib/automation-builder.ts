import { AIError, chatJsonStream } from "./ai";
import { emitPhase, emitReplyChunks, nextTraceId, type TraceEmitter } from "./ai-trace";
import { hasRequiredClarifications, normalizeAiClarifications } from "./ai-clarifications";
import {
  enrichAutomationClarifications,
  applyUserDeliveryIntent,
  inferPushEmailFromText,
  mentionsMyEmail,
  mentionsEmailPush,
  mentionsWecomPush,
  mentionsWecomAppPush,
  mentionsAllPartnersScope,
} from "./automation-clarifications";
import type { BuilderDeliveryPrefs } from "./builder-context-prompt";
import {
  pickAutomationTaskMd,
  inferDueWithinDays,
  buildScheduledPushTaskMd,
  defaultAutomationName,
  defaultAutomationSlug,
  partnerScopeLabel,
} from "./automation-push";
import {
  hasAutomationDeliveryChannel,
  mentionsPushToAssignees,
  mentionsPushToSelf,
  PUSH_WECOM_APP_ASSIGNEES,
  PUSH_WECOM_APP_ENABLED,
} from "./automation-delivery";
import { describeCron } from "./cron";
import { db } from "./db";
import { END_CUSTOMER_WHERE } from "./customer-filters";
import {
  deriveAutomationQueryFromGoal,
  describeAutomationQuery,
  serializeAutomationQuery,
  type AutomationQuery,
} from "./automation-query";
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
  pushWecomAppTo: "",
  partnerId: "",
  rationale: "",
  questionnaire: [],
  missingSkillNotes: [],
};

function outputSchema(locale: Locale) {
  const replyLang = locale === "zh" ? "Chinese" : "English";
  return `Output exactly one compact JSON object. User-visible: reply + intent.goal in ${replyLang}. No markdown fences.
{
  "reply": "one ${replyLang} sentence confirming what you understood",
  "clarifications": [],
  "ready": true/false,
  "intent": {
    "goal": "one-line ${replyLang}",
    "dataType": "todos|opportunities|web_search|mixed",
    "partnerScope": "all|named|bound",
    "partnerNameHint": "only if a partner company is named",
    "customerNameHint": "only if an end-customer/account is named",
    "assigneeNameHint": "only if a person's name is mentioned (e.g. Jackie 的待办)",
    "deliveryChannel": "email|wecom_group|wecom_app|unset",
    "emailRecipient": "mine|unset",
    "cronExpr": "0 9 * * *",
    "dueWithinDays": null
  }
}
Server generates slug/name/TASK.md and resolves names→IDs, and shows email/partner/wecom pickers — do NOT output draft or IDs.
emailRecipient=mine ONLY if user said 我的邮箱/发给我/to me; bare 「发邮箱」→ unset (UI picks recipients).
partnerNameHint = Fanruan partner company; customerNameHint = end-customer/account. They are different — pick the right one.
assigneeNameHint = a Hub user / person whose todos to list (only for dataType=todos).
clarifications always []. ready=true when goal + cronExpr + deliveryChannel are clear.`;
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
- 「每天把 Jackie 的待办推给我」→ dataType=todos, assigneeNameHint=Jackie, deliveryChannel=wecom_app, emailRecipient=unset
- 「每天把 Acme 过期待办推到群」→ dataType=todos, partnerScope=named, partnerNameHint=Acme, dueWithinDays=1, deliveryChannel=wecom_group
- 「每天汇总迪拜银行的商机发邮件」→ dataType=opportunities, customerNameHint=迪拜银行, deliveryChannel=email
- 「每天搜索 Acme 的招标新闻推到群」→ dataType=web_search, partnerNameHint=Acme, deliveryChannel=wecom_group

Rules:
1. SCHEDULE-only. Runtime tools: list_todos, list_opportunities, web_search, push_wecom, send_wecom_app, send_email.
2. partnerScope: all=全部; named=具体伙伴名; bound=绑定伙伴. Use customerNameHint for end-customers.
3. deliveryChannel: email=邮件; wecom_group=企微群; wecom_app=企微应用私信; unset=未说明（由 UI 澄清）.
4. clarifications always []. ready when goal+cronExpr+deliveryChannel set.
5. Keep JSON minimal — no extra fields, no draft block.

${outputSchema(locale)}`;
}

function isDraftReady(draft: AutomationBuilderDraft): boolean {
  if (!draft.cronExpr.trim()) return false;
  if (!draft.description.trim() && !draft.taskMd.trim()) return false;
  if (!hasAutomationDeliveryChannel(draft)) return false;
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
  const pushWecomAppTo = String(raw.pushWecomAppTo ?? "").trim();
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
      pushWecomAppTo,
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
    pushWecomAppTo,
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
  customerNameHint?: string;
  assigneeNameHint?: string;
  deliveryChannel?: "email" | "wecom_group" | "wecom_app" | "unset";
  emailRecipient?: "mine" | "unset";
  cronExpr?: string;
  dueWithinDays?: number | null;
};

/** 模糊匹配 Hub 用户（姓名 / 邮箱 / CRM 名 / 企微显示名） */
async function resolveAssigneeIdByName(name: string): Promise<{ id: string; name: string } | null> {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, crmSalesmanName: true, wecomDisplayName: true },
    take: 200,
  });
  const hit =
    users.find((u) => u.name?.toLowerCase() === q) ??
    users.find((u) => u.name?.toLowerCase().includes(q)) ??
    users.find((u) => u.email?.toLowerCase().includes(q)) ??
    users.find((u) => u.crmSalesmanName?.toLowerCase().includes(q)) ??
    users.find((u) => u.wecomDisplayName?.toLowerCase().includes(q)) ??
    null;
  return hit ? { id: hit.id, name: hit.name } : null;
}

/** 模糊匹配终端客户（排除伙伴自营影子档案） */
async function resolveCustomerIdByName(name: string): Promise<{ id: string; name: string } | null> {
  const q = name.trim();
  if (!q) return null;
  const c =
    (await db.customer.findFirst({
      where: { ...END_CUSTOMER_WHERE, name: { equals: q } },
      select: { id: true, name: true },
    })) ??
    (await db.customer.findFirst({
      where: { ...END_CUSTOMER_WHERE, name: { contains: q } },
      select: { id: true, name: true },
    }));
  return c ?? null;
}

/** 把 AI intent + 已解析草案 → 结构化 AutomationQuery（解析负责人/客户名→ID） */
async function buildBuilderQueryConfig(
  intent: AutomationBuilderAiIntent | undefined,
  draft: AutomationBuilderDraft
): Promise<{ query: AutomationQuery; assigneeName?: string; customerName?: string }> {
  const goal = draft.description?.trim() || intent?.goal?.trim() || "";
  const dueWithinDays =
    intent?.dueWithinDays != null && Number.isFinite(intent.dueWithinDays)
      ? Number(intent.dueWithinDays)
      : draft.dueWithinDays;

  // 基线：从目标文本推断 source/scope/到期
  const base = deriveAutomationQueryFromGoal({
    goal,
    partnerId: draft.partnerId || undefined,
    dueWithinDays,
  });

  // 显式 dataType 覆盖 source
  let source = base.source;
  if (intent?.dataType === "todos") source = "todos";
  else if (intent?.dataType === "opportunities") source = "opportunities";
  else if (intent?.dataType === "web_search") source = "ai";

  let customerName: string | undefined;
  let assigneeName: string | undefined;
  let scope = base.scope;
  let partnerId = draft.partnerId || undefined;
  let customerId: string | undefined;
  let assigneeId: string | undefined;

  // 客户优先于伙伴
  if (intent?.customerNameHint?.trim()) {
    const c = await resolveCustomerIdByName(intent.customerNameHint);
    if (c) {
      scope = "customer";
      customerId = c.id;
      customerName = c.name;
      partnerId = undefined;
    }
  }

  // 负责人（仅待办）
  if (source === "todos" && intent?.assigneeNameHint?.trim()) {
    const u = await resolveAssigneeIdByName(intent.assigneeNameHint);
    if (u) {
      assigneeId = u.id;
      assigneeName = u.name;
    }
  }

  const query: AutomationQuery = {
    source,
    scope,
    partnerId: scope === "partner" ? partnerId : undefined,
    customerId: scope === "customer" ? customerId : undefined,
    assigneeId: source === "todos" ? assigneeId : undefined,
    dueFilter: source === "todos" ? base.dueFilter ?? "all" : undefined,
    dueWithinDays:
      source === "todos" && (base.dueFilter ?? "all") === "within_days" ? base.dueWithinDays : undefined,
    opportunityStatus: source === "opportunities" ? "ALL" : undefined,
    aiGoal: source === "ai" ? goal || undefined : undefined,
  };

  return { query, assigneeName, customerName };
}

/** 从自然语言推断企微应用收件人（创建者 / 按负责人 / 指定人） */
async function resolveWecomAppRecipientFromIntent(
  intent: AutomationBuilderAiIntent | undefined,
  userText: string
): Promise<string> {
  if (intent?.deliveryChannel !== "wecom_app") return "";
  const blob = [userText, intent.goal].filter(Boolean);
  if (mentionsPushToAssignees(...blob)) return PUSH_WECOM_APP_ASSIGNEES;
  if (mentionsPushToSelf(...blob) || (intent.emailRecipient === "mine" && mentionsMyEmail(userText))) {
    return PUSH_WECOM_APP_ENABLED;
  }
  if (intent?.assigneeNameHint?.trim()) {
    const u = await resolveAssigneeIdByName(intent.assigneeNameHint);
    if (u) return u.id;
  }
  return PUSH_WECOM_APP_ENABLED;
}

/** 将 AI 输出的语义 intent 解析为 draft 字段（伙伴/邮箱由服务端查库） */
function applySemanticIntentFromAi(
  draft: AutomationBuilderDraft,
  intent: AutomationBuilderAiIntent | undefined,
  rawDraft: Partial<AutomationBuilderDraft>,
  opts: {
    partners: { id: string; name: string }[];
    boundPartnerId?: string;
    userEmail?: string;
    userText?: string;
  }
): AutomationBuilderDraft {
  const goal = intent?.goal?.trim() || rawDraft.description?.trim() || draft.description;
  const cronExpr = intent?.cronExpr?.trim() || rawDraft.cronExpr?.trim() || draft.cronExpr;
  let partnerId = draft.partnerId;
  let pushEmailTo = draft.pushEmailTo;
  let wecomPushChatId = draft.wecomPushChatId;
  let pushWecomAppTo = draft.pushWecomAppTo;
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
  const userText = opts.userText ?? "";
  if (channel === "email") {
    const explicit = inferPushEmailFromText(userText, opts.userEmail);
    if (explicit) {
      pushEmailTo = explicit;
    } else if (
      intent?.emailRecipient === "mine" &&
      opts.userEmail &&
      mentionsMyEmail(userText)
    ) {
      pushEmailTo = opts.userEmail;
    }
    wecomPushChatId = "";
    pushWecomAppTo = "";
  } else if (channel === "wecom_group") {
    pushEmailTo = "";
    pushWecomAppTo = "";
  } else if (channel === "wecom_app") {
    wecomPushChatId = "";
    pushEmailTo = "";
    pushWecomAppTo = PUSH_WECOM_APP_ENABLED;
  }

  return {
    ...draft,
    description: goal,
    cronExpr,
    partnerId,
    pushEmailTo,
    wecomPushChatId,
    pushWecomAppTo,
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
  const lastUserText = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const userPrompt =
    locale === "zh"
      ? `对话历史：\n${conversation}\n\n请输出紧凑 JSON（仅 reply + intent，勿 draft/ID）。`
      : `Conversation:\n${conversation}\n\nOutput compact JSON (reply + intent only, no draft/IDs).`;

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
    const { data: raw } = await chatJsonStream<{
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
      maxTokens: 512,
      emit: opts.emit,
    });

    if (!raw.intent?.goal?.trim() && lastUserText.trim()) {
      const t = lastUserText;
      raw.intent = {
        ...raw.intent,
        goal: t.slice(0, 160),
        dataType: /待办|todo/i.test(t) ? "todos" : /商机|opportunit/i.test(t) ? "opportunities" : "mixed",
        partnerScope: mentionsAllPartnersScope(t) ? "all" : undefined,
        deliveryChannel: mentionsEmailPush(t) ? "email" : mentionsWecomAppPush(t) ? "wecom_app" : mentionsWecomPush(t) ? "wecom_group" : raw.intent?.deliveryChannel,
        emailRecipient: mentionsMyEmail(t) ? "mine" : "unset",
        cronExpr: raw.intent?.cronExpr ?? "0 9 * * *",
      };
    }

    const partners = await db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    });

    let turn = normalizeTurn(raw as Partial<AutomationBuilderTurn>, locale, opts.boundPartnerName);
    const aiDraft = raw.draft ?? {};
    const baseDraft = normalizeDraft(
      {
        ...DEFAULT_DRAFT,
        ...aiDraft,
        partnerId: "",
        wecomPushChatId: "",
        pushEmailTo: "",
        pushWecomAppTo: "",
        taskMd: "",
      },
      opts.boundPartnerName,
      locale
    );
    const semanticDraft = applySemanticIntentFromAi(baseDraft, raw.intent, raw.draft ?? {}, {
      partners,
      boundPartnerId: opts.boundPartnerId,
      userEmail,
      userText: lastUserText,
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

    const wecomAppTo = await resolveWecomAppRecipientFromIntent(raw.intent, lastUserText);
    if (wecomAppTo) {
      turn = { ...turn, draft: { ...turn.draft, pushWecomAppTo: wecomAppTo } };
    }

    // 解析负责人/客户名 → 结构化 queryConfig（驱动确定性管道；source=ai 时回退 LLM）
    try {
      const { query, assigneeName, customerName } = await buildBuilderQueryConfig(raw.intent, turn.draft);
      const partnerName = query.partnerId
        ? partners.find((p) => p.id === query.partnerId)?.name
        : undefined;
      const summary = describeAutomationQuery(query, { partnerName, customerName, assigneeName }, locale);
      turn = {
        ...turn,
        draft: {
          ...turn.draft,
          queryConfig: serializeAutomationQuery(query),
          rationale: turn.draft.rationale ? `${turn.draft.rationale}\n${summary}` : summary,
        },
      };
    } catch {
      // 解析失败不阻断草案；保存时会回退到 deriveAutomationQueryFromGoal
    }

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
    const effectiveWecomApp =
      turn.draft.pushWecomAppTo.trim() || opts.deliveryPrefs?.wecomAppTo?.trim() || "";

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
      pushWecomAppTo: effectiveWecomApp,
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
        pushWecomAppTo: effectiveWecomApp,
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
    emitPhase(opts.emit, "idle");
    return turn;
  } catch (e) {
    const detail = e instanceof AIError ? e.message : String(e);
    return fallbackTurn(locale, detail);
  }
}
