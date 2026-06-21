import AiBot from "@wecom/aibot-node-sdk";
import { generateReqId } from "@wecom/aibot-node-sdk";
import type { WsFrame } from "@wecom/aibot-node-sdk";
import { db } from "@/lib/db";
import { AIError, getAiConfigSummary, type AiConfigSummary } from "@/lib/ai";
import {
  applyIntake,
  isProposeCancel,
  isProposeConfirm,
  isProposeCrmOnlyConfirm,
  isTodoListQueryIntent,
  shouldUseProposeMode,
  type IntakeMessage,
  type IntakeProposal,
  type IntakeScope,
} from "@/lib/ai-intake";
import type { AgentBuilderDraft, AgentBuilderMessage } from "@/lib/agent-builder";
import { runAgentBuilderTurn } from "@/lib/agent-builder";
import {
  isAgentBuilderCancel,
  isAgentBuilderConfirm,
  isAgentBuilderCreateCommand,
  isAgentBuilderIntent,
  isAgentBuilderTrialRun,
  shouldUseAgentBuilderMode,
} from "@/lib/agent-builder-intent";
import {
  formatAgentBuilderWecomReply,
  formatAgentCreatedReply,
  formatAgentTrialRunReply,
} from "@/lib/agent-builder-wecom-format";
import { createAgentFromDraft } from "@/lib/agent-create";
import type { AutomationBuilderDraft, AutomationBuilderMessage } from "@/lib/automation-builder-types";
import { runAutomationBuilderTurn } from "@/lib/automation-builder";
import {
  isAutomationBuilderIntent,
  shouldUseAutomationBuilderMode,
} from "@/lib/automation-builder-intent";
import {
  formatAutomationBuilderWecomReply,
  formatAutomationCreatedReply,
  formatAutomationTrialRunReply,
} from "@/lib/automation-builder-wecom-format";
import { createAutomationFromDraft } from "@/lib/automation-create";
import {
  isBuilderCancel,
  isBuilderConfirm,
  isBuilderTrialRun,
} from "@/lib/builder-intent-shared";
import { runAgent } from "@/lib/agent-runner";
import { runAssistantTurn, type AssistantTurnResult } from "@/lib/assistant-router";
import { mergeFinalProposal } from "@/lib/proposal-merge";
import { formatProposeAppliedReply, formatProposeConfirmBlockedReply, formatProposeWecomReply } from "@/lib/proposal-wecom-format";
import { enrichBusinessRecordCompanyTarget } from "@/lib/business-record-intake";
import {
  enrichProposalPartnerFromText,
  intakeScopeRequiresPartner,
  lookupSinglePartnerByName,
} from "@/lib/intake-partner-binding";
import {
  applyDirectClarification,
} from "@/lib/clarification-apply";
import {
  buildIntentConfirmSession,
  isIntentCancelCommand,
  isIntentConfirmCommand,
  parseIntentAlternativePick,
  sourceTextForRouting,
  type IntentConfirmSession,
} from "@/lib/intake-intent-confirm";
import type { FocusEntity } from "@/lib/focus-entity";
import { registerWecomChat } from "@/lib/wecom-chats";
import {
  formatWecomBotHelpReply,
  handleWecomBindCommand,
  isWecomBotHelpQuery,
  parseWecomBindCommand,
} from "@/lib/wecom-bind-commands";
import {
  formatWecomIdentityReply,
  isWecomIdentityQuery,
  resolveWecomActorUserId,
} from "@/lib/wecom-user-resolve";
import {
  claimPendingWecomPushJobs,
  markWecomPushJob,
} from "@/lib/wecom-push";

const MAX_HISTORY = 20;
const conversations = new Map<string, IntakeMessage[]>();

type ProposeSession = {
  scope: IntakeScope;
  partnerId?: string;
  proposal: IntakeProposal;
  ready: boolean;
  crmOnlyReady?: boolean;
  sourceText: string;
};

const proposeSessions = new Map<string, ProposeSession>();

const intentConfirmSessions = new Map<string, IntentConfirmSession>();

const focusSessions = new Map<string, FocusEntity>();

/** Hide internal [id:…] prefixes from user-facing list replies. */
function stripInternalIdsFromReply(reply: string): string {
  return reply.replace(/^\[id:[^\]]+\]\s*/gm, "");
}

type AgentBuilderSession = {
  messages: AgentBuilderMessage[];
  draft: AgentBuilderDraft;
  ready: boolean;
  sourceChatId: string;
  boundPartnerId?: string;
  lastCreatedAgentId?: string;
};

const agentBuilderSessions = new Map<string, AgentBuilderSession>();

type AutomationBuilderSession = {
  messages: AutomationBuilderMessage[];
  draft: AutomationBuilderDraft;
  ready: boolean;
  sourceChatId: string;
  lastCreatedAgentId?: string;
};

const automationBuilderSessions = new Map<string, AutomationBuilderSession>();

const EMPTY_AUTOMATION_DRAFT: AutomationBuilderDraft = {
  slug: "",
  name: "",
  description: "",
  taskMd: "",
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

const EMPTY_AGENT_DRAFT: AgentBuilderDraft = {
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

export type WecomBotStatus = {
  enabled: boolean;
  connected: boolean;
  authenticated: boolean;
  botId: string | null;
  userId: string | null;
  startedAt: string | null;
  lastError: string | null;
  ai: AiConfigSummary | null;
};

const status: WecomBotStatus = {
  enabled: false,
  connected: false,
  authenticated: false,
  botId: null,
  userId: null,
  startedAt: null,
  lastError: null,
  ai: null,
};

let wsClient: InstanceType<typeof AiBot.WSClient> | null = null;
let botUserId: string | null = null;
let aiSummaryCache: AiConfigSummary | null = null;
let pushTimer: ReturnType<typeof setInterval> | null = null;

function getConfig() {
  const botId = process.env.WECOM_BOT_ID?.trim();
  const secret = process.env.WECOM_BOT_SECRET?.trim();
  const wsUrl = process.env.WECOM_BOT_WS_URL?.trim();
  if (!botId || !secret) return null;
  return { botId, secret, wsUrl };
}

async function resolveBotUserId() {
  const configured = process.env.WECOM_BOT_USER_ID?.trim();
  if (configured) {
    const user = await db.user.findUnique({ where: { id: configured } });
    if (user) return user.id;
    console.warn(`[wecom-bot] WECOM_BOT_USER_ID=${configured} not found, falling back`);
  }
  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin.id;
  const any = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!any) throw new Error("系统中没有可用用户，请先创建管理员账号");
  return any.id;
}

function chatKey(frame: WsFrame) {
  return (
    frame.body?.chatid ??
    frame.body?.from?.userid ??
    frame.headers?.req_id ??
    "default"
  );
}

function appendHistory(key: string, role: "user" | "assistant", content: string) {
  const history = conversations.get(key) ?? [];
  history.push({ role, content });
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(key, history);
  return history;
}

function appendUserHint(history: IntakeMessage[], hint: string): IntakeMessage[] {
  if (!hint || !history.length) return history;
  const last = history[history.length - 1];
  if (last.role !== "user") return history;
  return [
    ...history.slice(0, -1),
    { role: "user" as const, content: last.content + `\n\n（${hint}）` },
  ];
}

function withPartnerHint(
  history: IntakeMessage[],
  boundPartnerId?: string | null,
  boundPartnerName?: string | null,
  boundCustomerName?: string | null
): IntakeMessage[] {
  if (boundPartnerId && boundPartnerName) {
    return appendUserHint(
      history,
      `系统提示：当前会话已绑定伙伴「${boundPartnerName}」。商务记录、商机、联系人、培训、联合方案等均默认归属该伙伴；「这个伙伴/该客户」均指该伙伴。`
    );
  }
  if (boundCustomerName) {
    return appendUserHint(
      history,
      `系统提示：当前会话已绑定客户「${boundCustomerName}」。商务记录默认归属该客户；proposal.partnerName 请填「${boundCustomerName}」；「这个客户/该客户」均指该客户。`
    );
  }
  return history;
}

/** Open intake (no bound group): user picks partner by name before confirm. */
async function applyPartnerPickToSession(
  session: ProposeSession,
  text: string,
  boundPartnerId?: string,
  boundCustomerId?: string
): Promise<ProposeSession> {
  // 已绑定伙伴或客户的群，无需用户再选公司
  if (boundPartnerId || boundCustomerId) return session;

  let proposal = session.proposal;
  if (!proposal.partnerName?.trim()) {
    proposal = await enrichProposalPartnerFromText(proposal, text, boundPartnerId);
  }

  const partnerClarification = session.scope === "business_record"
    ? { id: "partnerName", question: "", options: [], multi: false, allowOther: true, apply: "direct" as const, kind: "identity" as const, blocking: true }
    : null;
  if (partnerClarification && !proposal.partnerName?.trim() && intakeScopeRequiresPartner(session.scope)) {
    const applied = applyDirectClarification(proposal, partnerClarification, text);
    proposal = applied.proposal;
  }

  if (!proposal.partnerName?.trim()) return { ...session, proposal };

  const match = await lookupSinglePartnerByName(proposal.partnerName);
  return {
    ...session,
    partnerId: match?.id ?? session.partnerId,
    proposal: match ? { ...proposal, partnerName: match.name } : proposal,
  };
}

async function prepareSessionForApply(
  session: ProposeSession,
  boundPartnerId?: string,
  boundCustomerId?: string
): Promise<ProposeSession> {
  if (boundPartnerId) return session;
  const proposal =
    session.scope === "business_record"
      ? await enrichBusinessRecordCompanyTarget(session.proposal, session.sourceText, boundPartnerId, boundCustomerId)
      : await enrichProposalPartnerFromText(session.proposal, session.sourceText, boundPartnerId);
  if (!proposal.partnerName?.trim() && session.scope !== "business_record") {
    return { ...session, proposal };
  }
  if (session.scope === "business_record" && proposal.saveMode === "crm_only") {
    return { ...session, proposal };
  }
  const match = proposal.partnerName ? await lookupSinglePartnerByName(proposal.partnerName) : null;
  return {
    ...session,
    partnerId: match?.id ?? session.partnerId,
    proposal: match ? { ...proposal, partnerName: match.name } : proposal,
  };
}

function buildAgentBuilderContextHint(opts: {
  boundPartnerId?: string;
  boundPartnerName?: string;
  sourceChatId: string;
  chatType: "group" | "single";
}): string {
  const parts: string[] = [];
  if (opts.boundPartnerId && opts.boundPartnerName) {
    parts.push(
      `系统提示：当前企微群已绑定伙伴「${opts.boundPartnerName}」(partnerId=${opts.boundPartnerId})，可作为 scopeType=PARTNER 默认值`
    );
  }
  if (opts.chatType === "group" && opts.sourceChatId) {
    parts.push(
      `系统提示：用户正在企微群 chatId=${opts.sourceChatId} 中构建 Agent；若需推送到本群，可设 deliveryMode=wecom_chat`
    );
  }
  return parts.join("；");
}

function buildAutomationBuilderContextHint(opts: {
  sourceChatId: string;
  chatType: "group" | "single";
  boundPartnerId?: string;
  boundPartnerName?: string;
}): string {
  const parts: string[] = [];
  if (opts.boundPartnerId && opts.boundPartnerName) {
    parts.push(
      `系统提示：当前企微群已绑定伙伴「${opts.boundPartnerName}」(partnerId=${opts.boundPartnerId})；用户说「这个客户/该伙伴」时 draft.partnerId 默认使用该值，否则可留空表示全部伙伴`
    );
  }
  if (opts.chatType === "group" && opts.sourceChatId) {
    parts.push(
      `系统提示：用户正在企微群 chatId=${opts.sourceChatId} 中构建自动化；推送目标默认 wecomPushChatId=${opts.sourceChatId}`
    );
  }
  return parts.join("；");
}

function resolveSourceChatId(frame: WsFrame, chatId?: string | null): string {
  return chatId ?? frame.body?.chatid ?? frame.body?.from?.userid ?? "default";
}

async function refreshAiSummary() {
  aiSummaryCache = await getAiConfigSummary();
  status.ai = aiSummaryCache;
  return aiSummaryCache;
}

async function persistAgentBuilderSession(opts: {
  agentSession: AgentBuilderSession;
  actorUserId: string;
  actor: Awaited<ReturnType<typeof resolveWecomActorUserId>>;
  key: string;
}): Promise<{ created: Awaited<ReturnType<typeof createAgentFromDraft>>; draft: AgentBuilderDraft; reply: string } | { error: string }> {
  const { agentSession, actorUserId, actor, key } = opts;
  if (!agentSession.ready) {
    return { error: "Agent 草案信息还不够完整，请按清单补全 ⬜ 项后再回复「确认」或「创建Agent」，或回复「取消」放弃。" };
  }
  if (actor.matchedBy === "fallback") {
    return {
      error:
        "⚠️ 未识别到你的 Partner Hub 账号。请先在 Web 个人中心生成绑定码，再 @我 绑定 XXXXXX 后再创建 Agent。",
    };
  }
  const draft = agentSession.draft;
  const wecomPushChatId = draft.deliveryMode === "wecom_chat" ? agentSession.sourceChatId : undefined;
  const created = await createAgentFromDraft(draft, actorUserId, { wecomPushChatId });
  agentBuilderSessions.set(key, {
    ...agentSession,
    ready: false,
    lastCreatedAgentId: created.id,
    messages: [],
    draft: EMPTY_AGENT_DRAFT,
  });
  const reply = formatAgentCreatedReply(created, draft);
  console.log(`[wecom-bot] Agent 已创建 id=${created.id.slice(0, 8)}… actor=${actorUserId.slice(0, 8)}…`);
  return { created, draft, reply };
}

async function persistAutomationBuilderSession(opts: {
  automationSession: AutomationBuilderSession;
  actorUserId: string;
  actor: Awaited<ReturnType<typeof resolveWecomActorUserId>>;
  key: string;
}): Promise<
  | { created: Awaited<ReturnType<typeof createAutomationFromDraft>>; draft: AutomationBuilderDraft; reply: string }
  | { error: string }
> {
  const { automationSession, actorUserId, actor, key } = opts;
  if (!automationSession.ready) {
    return {
      error: "自动化草案信息还不够完整，请按清单补全 ⬜ 项后再回复「确认」或「创建自动化」，或回复「取消」放弃。",
    };
  }
  if (actor.matchedBy === "fallback") {
    return {
      error:
        "⚠️ 未识别到你的 Partner Hub 账号。请先在 Web 个人中心生成绑定码，再 @我 绑定 XXXXXX 后再创建自动化。",
    };
  }
  const draft = automationSession.draft;
  const created = await createAutomationFromDraft(draft, actorUserId, {
    wecomPushChatId: draft.wecomPushChatId || automationSession.sourceChatId,
    partnerId: draft.partnerId,
    locale: "zh",
  });
  automationBuilderSessions.set(key, {
    ...automationSession,
    ready: false,
    lastCreatedAgentId: created.id,
    messages: [],
    draft: EMPTY_AUTOMATION_DRAFT,
  });
  const reply = formatAutomationCreatedReply(created, draft);
  console.log(`[wecom-bot] Automation 已创建 id=${created.id.slice(0, 8)}… actor=${actorUserId.slice(0, 8)}…`);
  return { created, draft, reply };
}

async function applyAssistantTurnResult(opts: {
  result: AssistantTurnResult;
  key: string;
  history: IntakeMessage[];
  session: ProposeSession | undefined;
  boundPartnerId?: string;
  boundPartnerName?: string;
  chatType: "group" | "single";
  actorUserId: string;
  actor: Awaited<ReturnType<typeof resolveWecomActorUserId>>;
  text: string;
}): Promise<string> {
  const {
    result,
    key,
    history,
    session,
    boundPartnerId,
    boundPartnerName,
    chatType,
    actorUserId,
    actor,
    text,
  } = opts;

  if (result.mode === "intent_confirm") {
    const sourceText = sourceTextForRouting(history);
    intentConfirmSessions.set(
      key,
      buildIntentConfirmSession({
        route: {
          actionId: result.actionId,
          route: result.route,
          confidence: "high",
          source: "forced",
        },
        sourceText,
        locale: "zh",
        partnerName: boundPartnerName,
        focus: result.focus,
        patchInstruction: result.patchInstruction,
        patchTargetId: result.patchTargetId,
        patchTargetLabel: result.patchTargetLabel,
      })
    );
    if (result.focus) focusSessions.set(key, result.focus);
    proposeSessions.delete(key);
    console.log(`[wecom-bot] 意图确认 action=${result.actionId}`);
    return result.reply;
  }

  if (result.mode === "propose") {
    const merged = mergeFinalProposal(session?.proposal ?? null, result.proposal, new Set());
    const sourceText = history
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    const scope = result.scope;
    const partnerId = boundPartnerId ?? session?.partnerId;

    proposeSessions.set(key, {
      scope,
      partnerId,
      proposal: merged,
      ready: result.ready,
      crmOnlyReady: result.crmOnlyReady,
      sourceText,
    });
    console.log(`[wecom-bot] Propose(${result.scope}) ready=${result.ready}`);
    return formatProposeWecomReply({
      scope: result.scope,
      reply: result.reply,
      proposal: merged,
      ready: result.ready,
      crmOnlyReady: result.crmOnlyReady,
      questions: result.questions,
      chatType,
    });
  }

  if (result.mode === "automation_builder") {
    return formatAutomationBuilderWecomReply({
      turn: result,
      chatType,
    });
  }

  if (result.mode === "agent_builder") {
    return formatAgentBuilderWecomReply({
      turn: result,
      chatType,
      boundPartnerName,
    });
  }

  if (session && !shouldUseProposeMode(history)) {
    proposeSessions.delete(key);
  }
  intentConfirmSessions.delete(key);

  if (result.mode !== "query") {
    console.warn(`[wecom-bot] Unexpected assistant mode: ${(result as { mode?: string }).mode}`);
    return "抱歉，未能生成回复。";
  }

  if (result.focus) {
    focusSessions.set(key, result.focus);
    console.log(`[wecom-bot] Focus ${result.focus.kind} items=${result.focus.listItems?.length ?? 1}`);
  }
  const modeLabel = isTodoListQueryIntent(text) ? "待办查询" : text.slice(0, 20);
  console.log(`[wecom-bot] 回复(${modeLabel}…): ${result.reply.slice(0, 120)}…`);
  return stripInternalIdsFromReply(result.reply);
}

async function handleTextMessage(frame: WsFrame) {
  if (!wsClient || !botUserId) return;
  const text = frame.body?.text?.content?.trim();
  if (!text) return;

  const chat = await registerWecomChat({
    chatId: frame.body?.chatid,
    chatType: frame.body?.chattype,
    fromUserId: frame.body?.from?.userid,
    text,
  });
  if (chat?.chatType === "group") {
    const binding = chat.partner
      ? ` 已绑定伙伴=${chat.partner.name}`
      : chat.customer
        ? ` 已绑定客户=${chat.customer.name}`
        : " 尚未绑定伙伴/客户";
    console.log(`[wecom-bot] 群聊已登记 chatId=${chat.chatId}${binding}`);
  }

  const key = chatKey(frame);
  const fromUserId = frame.body?.from?.userid?.trim() || null;
  const actor = await resolveWecomActorUserId({
    fromUserId,
    fallbackUserId: botUserId,
  });
  const actorUserId = actor.userId;

  if (isWecomIdentityQuery(text)) {
    const streamId = generateReqId("stream");
    const reply = formatWecomIdentityReply({ fromUserId, resolution: actor });
    appendHistory(key, "user", text);
    appendHistory(key, "assistant", reply);
    await wsClient.replyStream(frame, streamId, reply, true);
    console.log(`[wecom-bot] 身份查询 from=${fromUserId ?? "?"} matched=${actor.matchedBy} hub=${actorUserId.slice(0, 8)}…`);
    return;
  }

  const bindCommand = parseWecomBindCommand(text);
  if (bindCommand) {
    const streamId = generateReqId("stream");
    const reply = await handleWecomBindCommand(bindCommand, fromUserId);
    appendHistory(key, "user", text);
    appendHistory(key, "assistant", reply);
    await wsClient.replyStream(frame, streamId, reply, true);
    console.log(`[wecom-bot] 绑定指令 type=${bindCommand.type} from=${fromUserId ?? "?"}`);
    return;
  }

  if (isWecomBotHelpQuery(text)) {
    const streamId = generateReqId("stream");
    const reply = formatWecomBotHelpReply();
    appendHistory(key, "user", text);
    appendHistory(key, "assistant", reply);
    await wsClient.replyStream(frame, streamId, reply, true);
    return;
  }

  const history = appendHistory(key, "user", text);
  const streamId = generateReqId("stream");

  const ai = aiSummaryCache ?? (await refreshAiSummary());
  if (!ai.configured) {
    await wsClient.replyStream(
      frame,
      streamId,
      "系统尚未配置大模型 API。请管理员在 Web 端「团队设置 → 大模型管理中心」添加并启用模型，无需单独配置 .env。",
      true
    );
    return;
  }

  await wsClient.replyStream(frame, streamId, "正在思考，请稍候…", false);

  const boundPartnerId = chat?.partnerId ?? undefined;
  const boundPartnerName = chat?.partner?.name;
  const boundCustomerId = chat?.customerId ?? undefined;
  const boundCustomerName = chat?.customer?.name;
  const chatType: "group" | "single" =
    chat?.chatType === "group" || frame.body?.chattype === "group" ? "group" : "single";
  const sourceChatId = resolveSourceChatId(frame, chat?.chatId);
  let session = proposeSessions.get(key);
  let agentSession = agentBuilderSessions.get(key);
  let automationSession = automationBuilderSessions.get(key);
  let intentSession = intentConfirmSessions.get(key);

  try {
    if (isAutomationBuilderIntent(text)) {
      proposeSessions.delete(key);
      intentConfirmSessions.delete(key);
      focusSessions.delete(key);
      agentBuilderSessions.delete(key);
      session = undefined;
      intentSession = undefined;
      agentSession = undefined;
    }
    if (isAgentBuilderIntent(text)) {
      proposeSessions.delete(key);
      intentConfirmSessions.delete(key);
      focusSessions.delete(key);
      automationBuilderSessions.delete(key);
      session = undefined;
      intentSession = undefined;
      automationSession = undefined;
    }

    // ---- Automation Builder session (priority over Agent Builder) ----
    if (automationSession && isBuilderCancel(text)) {
      automationBuilderSessions.delete(key);
      const reply = "已取消自动化草案。你可以继续正常提问，或重新描述要构建的自动化任务。";
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (automationSession && isBuilderTrialRun(text)) {
      if (!automationSession.lastCreatedAgentId && automationSession.ready) {
        const persisted = await persistAutomationBuilderSession({ automationSession, actorUserId, actor, key });
        if ("error" in persisted) {
          appendHistory(key, "assistant", persisted.error);
          await wsClient.replyStream(frame, streamId, persisted.error, true);
          return;
        }
        automationSession = automationBuilderSessions.get(key);
      }
      if (!automationSession?.lastCreatedAgentId) {
        const reply = "暂无可试运行的自动化。请先 @我 **确认** 或 **创建自动化** 完成创建。";
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
        return;
      }
      await wsClient.replyStream(frame, streamId, "正在试运行自动化，请稍候…", false);
      try {
        const agent = await db.agent.findUniqueOrThrow({ where: { id: automationSession.lastCreatedAgentId } });
        const output = await runAgent(automationSession.lastCreatedAgentId, "manual");
        const lastRun = await db.agentRun.findFirst({
          where: { agentId: agent.id },
          orderBy: { startedAt: "desc" },
          select: { toolLog: true },
        });
        let pushedWecom = false;
        try {
          const log = JSON.parse(lastRun?.toolLog ?? "[]") as { tool?: string }[];
          pushedWecom = log.some((t) => t.tool === "push_wecom");
        } catch {
          /* ignore */
        }
        const reply = pushedWecom
          ? `✅ **试运行完成 · ⚡ ${agent.name}**\n\n结果已通过 \`push_wecom\` 推送到群，请查看上方消息。`
          : formatAutomationTrialRunReply(output, agent.name);
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await wsClient.replyStream(frame, streamId, `试运行失败：${msg}`, true);
      }
      return;
    }

    if (automationSession && isBuilderConfirm(text)) {
      const persisted = await persistAutomationBuilderSession({ automationSession, actorUserId, actor, key });
      if ("error" in persisted) {
        appendHistory(key, "assistant", persisted.error);
        await wsClient.replyStream(frame, streamId, persisted.error, true);
        return;
      }
      appendHistory(key, "assistant", persisted.reply);
      await wsClient.replyStream(frame, streamId, persisted.reply, true);
      return;
    }

    const skipAutomationTurn =
      !!automationSession?.ready && isBuilderConfirm(text);
    const inAutomationBuilder =
      !skipAutomationTurn && (!!automationSession || shouldUseAutomationBuilderMode(history));
    if (inAutomationBuilder) {
      proposeSessions.delete(key);
      if (!automationSession) {
        automationSession = {
          messages: [],
          draft: EMPTY_AUTOMATION_DRAFT,
          ready: false,
          sourceChatId,
        };
      }
      automationSession.messages.push({ role: "user", content: text });
      const contextHint = buildAutomationBuilderContextHint({
        sourceChatId,
        chatType,
        boundPartnerId,
        boundPartnerName,
      });
      const builderMessages = automationSession.messages.map((m, i, arr) => {
        if (i !== arr.length - 1 || m.role !== "user" || !contextHint) return m;
        return { role: "user" as const, content: `${m.content}\n\n（${contextHint}）` };
      });
      const turn = await runAutomationBuilderTurn({
        messages: builderMessages,
        userId: actorUserId,
        locale: "zh",
        boundPartnerId,
        boundPartnerName,
        sourceChatId,
      });
      automationSession.messages.push({ role: "assistant", content: turn.reply });
      automationSession.draft = turn.draft;
      automationSession.ready = turn.ready;
      automationBuilderSessions.set(key, automationSession);
      const reply = formatAutomationBuilderWecomReply({ turn, chatType, boundPartnerName });
      appendHistory(key, "assistant", reply);
      console.log(`[wecom-bot] AutomationBuilder ready=${turn.ready} name=${turn.draft.name || "(draft)"}`);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    // ---- Agent Builder session (priority over Propose) ----
    if (agentSession && isAgentBuilderCancel(text)) {
      agentBuilderSessions.delete(key);
      const reply = "已取消 Agent 草案。你可以继续正常提问，或重新描述要构建的自动化 Agent。";
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (agentSession && isAgentBuilderTrialRun(text)) {
      if (!agentSession.lastCreatedAgentId && agentSession.ready) {
        const persisted = await persistAgentBuilderSession({ agentSession, actorUserId, actor, key });
        if ("error" in persisted) {
          appendHistory(key, "assistant", persisted.error);
          await wsClient.replyStream(frame, streamId, persisted.error, true);
          return;
        }
        agentSession = agentBuilderSessions.get(key);
      }
      if (!agentSession?.lastCreatedAgentId) {
        const reply = "暂无可试运行的 Agent。请先 @我 **确认** 或 **创建Agent** 完成创建。";
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
        return;
      }
      await wsClient.replyStream(frame, streamId, "正在试运行 Agent，请稍候…", false);
      try {
        const agent = await db.agent.findUniqueOrThrow({ where: { id: agentSession.lastCreatedAgentId } });
        const output = await runAgent(agentSession.lastCreatedAgentId, "manual");
        const reply = formatAgentTrialRunReply(output, agent.name);
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await wsClient.replyStream(frame, streamId, `试运行失败：${msg}`, true);
      }
      return;
    }

    if (agentSession && isAgentBuilderConfirm(text)) {
      const persisted = await persistAgentBuilderSession({ agentSession, actorUserId, actor, key });
      if ("error" in persisted) {
        appendHistory(key, "assistant", persisted.error);
        await wsClient.replyStream(frame, streamId, persisted.error, true);
        return;
      }
      appendHistory(key, "assistant", persisted.reply);
      await wsClient.replyStream(frame, streamId, persisted.reply, true);
      return;
    }

    const skipBuilderTurn =
      !!agentSession?.ready && (isAgentBuilderConfirm(text) || isAgentBuilderCreateCommand(text));
    const inAgentBuilder =
      !skipBuilderTurn && (!!agentSession || shouldUseAgentBuilderMode(history));
    if (inAgentBuilder) {
      proposeSessions.delete(key);
      if (!agentSession) {
        agentSession = {
          messages: [],
          draft: EMPTY_AGENT_DRAFT,
          ready: false,
          sourceChatId,
          boundPartnerId,
        };
      }
      agentSession.messages.push({ role: "user", content: text });
      const contextHint = buildAgentBuilderContextHint({
        boundPartnerId,
        boundPartnerName,
        sourceChatId,
        chatType,
      });
      const builderMessages = agentSession.messages.map((m, i, arr) => {
        if (i !== arr.length - 1 || m.role !== "user" || !contextHint) return m;
        return { role: "user" as const, content: `${m.content}\n\n（${contextHint}）` };
      });
      const turn = await runAgentBuilderTurn({
        messages: builderMessages,
        userId: actorUserId,
        locale: "zh",
      });
      agentSession.messages.push({ role: "assistant", content: turn.reply });
      agentSession.draft = turn.draft;
      agentSession.ready = turn.ready;
      agentBuilderSessions.set(key, agentSession);
      const reply = formatAgentBuilderWecomReply({
        turn,
        chatType,
        boundPartnerName,
      });
      appendHistory(key, "assistant", reply);
      console.log(`[wecom-bot] AgentBuilder ready=${turn.ready} name=${turn.draft.name || "(draft)"}`);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    // ---- Intent confirm (priority over propose content confirm — both use @确认) ----
    if (intentSession && isIntentCancelCommand(text)) {
      intentConfirmSessions.delete(key);
      const reply = "已取消，未开始录入。你可以继续正常提问，或重新描述要执行的操作。";
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (intentSession && isIntentConfirmCommand(text)) {
      intentConfirmSessions.delete(key);
      const messages = withPartnerHint(history, boundPartnerId, boundPartnerName, boundCustomerName);
      const focus = intentSession.focus ?? focusSessions.get(key);
      const result = await runAssistantTurn({
        messages,
        userId: actorUserId,
        partnerId: boundPartnerId ?? session?.partnerId,
        partnerName: boundPartnerName,
        locale: "zh",
        feature: intentSession.route.mode === "patch" ? "WeCom Bot · Patch" : "WeCom Bot · Propose",
        confirmedActionId: intentSession.actionId,
        previousScope: session?.scope,
        focus,
        patchTargetId: intentSession.patchTargetId,
        patchTargetLabel: intentSession.patchTargetLabel,
        patchInstruction: intentSession.patchInstruction,
      });
      const reply = await applyAssistantTurnResult({
        result,
        key,
        history,
        session,
        boundPartnerId,
        boundPartnerName,
        chatType,
        actorUserId,
        actor,
        text,
      });
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (intentSession) {
      const altActionId = parseIntentAlternativePick(text, intentSession);
      if (altActionId) {
        intentConfirmSessions.delete(key);
        const messages = withPartnerHint(history, boundPartnerId, boundPartnerName, boundCustomerName);
        const result = await runAssistantTurn({
          messages,
          userId: actorUserId,
          partnerId: boundPartnerId ?? session?.partnerId,
          partnerName: boundPartnerName,
          locale: "zh",
          feature: altActionId.startsWith("query.") ? "WeCom Bot" : "WeCom Bot · Propose",
          confirmedActionId: altActionId,
          previousScope: session?.scope,
          focus: focusSessions.get(key),
        });
        const reply = await applyAssistantTurnResult({
          result,
          key,
          history,
          session,
          boundPartnerId,
          boundPartnerName,
          chatType,
          actorUserId,
          actor,
          text,
        });
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
        return;
      }
      intentConfirmSessions.delete(key);
      intentSession = undefined;
    }

    // ---- Propose session ----
    if (session && isProposeCancel(text)) {
      proposeSessions.delete(key);
      const reply = "已取消，未保存任何草案内容。你可以继续正常提问，或重新发起录入。";
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (session && isProposeCrmOnlyConfirm(text)) {
      if (!session.crmOnlyReady) {
        const reply =
          "当前草案暂不支持仅写 CRM（可能 CRM 未匹配或必填项未齐）。请按清单补全，或在 Partner Hub 建档后回复「确认」。";
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
        return;
      }
      session = await prepareSessionForApply(session, boundPartnerId, boundCustomerId);
      session = {
        ...session,
        proposal: { ...session.proposal, saveMode: "crm_only" as const },
      };
      const applied = await applyIntake({
        scope: session.scope,
        partnerId: boundPartnerId ?? session.partnerId,
        customerId: boundCustomerId,
        proposal: session.proposal,
        userId: actorUserId,
        sourceText: session.sourceText,
        locale: "zh",
      });
      proposeSessions.delete(key);
      let reply = formatProposeAppliedReply(applied.applied, applied.partnerId, session.scope);
      if (!actor.hubUser?.crmSalesmanName) {
        reply += "\n\n⚠️ 你尚未绑定 CRM 销售账号，无法写入帆软 CRM。";
      }
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (session && isProposeConfirm(text)) {
      if (!session.ready) {
        const reply = session.crmOnlyReady
          ? "Partner Hub 未建档。若只写入帆软 CRM，请回复 **仅CRM**；或回复「取消」放弃。"
          : formatProposeConfirmBlockedReply({
              scope: session.scope,
              proposal: session.proposal,
              ready: session.ready,
              crmOnlyReady: session.crmOnlyReady,
            });
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
        return;
      }
      session = await prepareSessionForApply(session, boundPartnerId, boundCustomerId);
      proposeSessions.set(key, session);
      const applied = await applyIntake({
        scope: session.scope,
        partnerId: boundPartnerId ?? session.partnerId,
        customerId: boundCustomerId,
        proposal: session.proposal,
        userId: actorUserId,
        sourceText: session.sourceText,
        locale: "zh",
      });
      proposeSessions.delete(key);
      let reply = formatProposeAppliedReply(applied.applied, applied.partnerId, session.scope);
      if (actor.matchedBy === "fallback") {
        reply +=
          "\n\n⚠️ 未识别到你的 Partner Hub 账号（请在 Web 个人中心绑定企微 userid）。CRM 可能无法以你的销售账号归档。";
      } else if (session.scope === "business_record" && !actor.hubUser?.crmSalesmanName) {
        reply += "\n\n⚠️ 你尚未绑定 CRM 销售账号，商务记录已存本地但可能未同步 CRM。";
      }
      appendHistory(key, "assistant", reply);
      console.log(
        `[wecom-bot] Propose 已保存 scope=${session.scope} partner=${applied.partnerId.slice(0, 8)}… actor=${actorUserId.slice(0, 8)}… (${actor.matchedBy})`,
      );
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (session && !isProposeConfirm(text) && !isProposeCancel(text) && !isProposeCrmOnlyConfirm(text)) {
      session = await applyPartnerPickToSession(session, text, boundPartnerId, boundCustomerId);
      proposeSessions.set(key, session);
    }

    if (isTodoListQueryIntent(text)) {
      proposeSessions.delete(key);
      intentConfirmSessions.delete(key);
      agentBuilderSessions.delete(key);
      session = undefined;
      intentSession = undefined;
    }

    agentBuilderSessions.delete(key);
    const messages = withPartnerHint(history, boundPartnerId, boundPartnerName, boundCustomerName);
    const continuingPropose = !isAgentBuilderIntent(text) && !!session;
    const focus = focusSessions.get(key);

    const result = await runAssistantTurn({
      messages,
      userId: actorUserId,
      partnerId: boundPartnerId ?? session?.partnerId,
      partnerName: boundPartnerName,
      locale: "zh",
      feature: continuingPropose ? "WeCom Bot · Propose" : "WeCom Bot",
      forcePropose: continuingPropose,
      skipIntentConfirm: continuingPropose,
      previousScope: session?.scope,
      focus,
    });

    const reply = await applyAssistantTurnResult({
      result,
      key,
      history,
      session,
      boundPartnerId,
      boundPartnerName,
      chatType,
      actorUserId,
      actor,
      text,
    });

    appendHistory(key, "assistant", reply);
    await wsClient.replyStream(frame, streamId, reply, true);
  } catch (e) {
    const msg =
      e instanceof AIError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    status.lastError = msg;
    console.error("[wecom-bot] Assistant error:", msg);
    await wsClient.replyStream(
      frame,
      streamId,
      `抱歉，处理消息时出错：${msg}`,
      true
    );
  }
}

async function processPushQueue() {
  if (!wsClient?.isConnected) return;
  const jobs = await claimPendingWecomPushJobs(5);
  for (const job of jobs) {
    try {
      await wsClient.sendMessage(job.chatId, {
        msgtype: "markdown",
        markdown: { content: job.content },
      });
      await markWecomPushJob(job.id, "SENT");
      console.log(`[wecom-bot] 主动推送成功 chatId=${job.chatId.slice(0, 12)}…`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markWecomPushJob(job.id, "FAILED", msg);
      console.error(`[wecom-bot] 主动推送失败: ${msg}`);
    }
  }
}

export async function pushWecomMarkdown(chatId: string, content: string) {
  if (!wsClient?.isConnected) throw new Error("企微机器人未连接");
  await wsClient.sendMessage(chatId, {
    msgtype: "markdown",
    markdown: { content },
  });
}

export function getWecomBotStatus(): WecomBotStatus {
  return {
    ...status,
    connected: wsClient?.isConnected ?? status.connected,
    ai: aiSummaryCache ?? status.ai,
  };
}

export async function startWecomBot() {
  const config = getConfig();
  if (!config) {
    console.log("[wecom-bot] WECOM_BOT_ID / WECOM_BOT_SECRET 未配置，跳过启动");
    return { stop: () => {} };
  }

  if (wsClient) {
    console.log("[wecom-bot] 已在运行，跳过重复启动");
    return { stop: () => stopWecomBot() };
  }

  botUserId = await resolveBotUserId();
  const ai = await refreshAiSummary();
  status.enabled = true;
  status.botId = config.botId;
  status.userId = botUserId;
  status.startedAt = new Date().toISOString();
  status.lastError = null;

  wsClient = new AiBot.WSClient({
    botId: config.botId,
    secret: config.secret,
    ...(config.wsUrl ? { wsUrl: config.wsUrl } : {}),
    maxReconnectAttempts: -1,
  });

  wsClient.on("authenticated", () => {
    status.authenticated = true;
    status.connected = true;
    console.log("[wecom-bot] 认证成功，已连接企业微信");
  });

  wsClient.on("disconnected", () => {
    status.connected = false;
    status.authenticated = false;
    console.warn("[wecom-bot] 连接断开，将自动重连…");
  });

  wsClient.on("error", (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    status.lastError = msg;
    console.error("[wecom-bot] 错误:", msg);
  });

  wsClient.on("message.text", (frame: WsFrame) => {
    void handleTextMessage(frame);
  });

  wsClient.on("event.enter_chat", (frame: WsFrame) => {
    void wsClient?.replyWelcome(frame, {
      msgtype: "text",
      text: {
        content:
          "你好！我是帆软中东伙伴管理助手。\n\n你可以：\n• 查询：当前有哪些 Tier A 伙伴？某伙伴档案？\n• 指令：推进阶段、创建待办\n• 身份：@我 我是谁 / @我 绑定 / @我 帮助\n• Agent 创建：@我 创建一个 Agent（如定时提醒、扫描待办）→ 多轮澄清 → @我 确认\n• 录入（协作 Agent）：\n  - 记录商务进展 / 拜访 / 会议纪要\n  - 添加商机、联系人\n  录入时会先给出草案，群聊请 @我 并回复「确认」保存或「取消」放弃。\n\n直接 @我 发消息即可开始。",
      },
    });
  });

  wsClient.connect();
  pushTimer = setInterval(() => {
    void processPushQueue();
  }, 5000);
  if (ai.configured) {
    const apiList =
      ai.source === "database"
        ? ai.apis.map((a) => `${a.name}(${a.model})`).join("、")
        : ai.preferredLabel;
    console.log(
      `[wecom-bot] AI 已就绪 — 共用团队设置中的模型（${ai.source}），调度池：${apiList}`
    );
  } else {
    console.warn(
      "[wecom-bot] 未检测到 AI 配置；请在「团队设置 → 大模型管理中心」添加 API（与 Web 助手共用，无需 .env）"
    );
  }
  console.log(
    `[wecom-bot] 正在连接… botId=${config.botId.slice(0, 8)}… userId=${botUserId}`
  );

  return { stop: () => stopWecomBot() };
}

export function stopWecomBot() {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  status.connected = false;
  status.authenticated = false;
  console.log("[wecom-bot] 已停止");
}
