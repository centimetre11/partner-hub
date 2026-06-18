import AiBot from "@wecom/aibot-node-sdk";
import { generateReqId } from "@wecom/aibot-node-sdk";
import type { WsFrame } from "@wecom/aibot-node-sdk";
import { db } from "@/lib/db";
import { AIError, getAiConfigSummary, type AiConfigSummary } from "@/lib/ai";
import {
  applyIntake,
  isProposeCancel,
  isProposeConfirm,
  shouldUseProposeMode,
  type IntakeMessage,
  type IntakeProposal,
  type IntakeScope,
} from "@/lib/ai-intake";
import { runAssistantTurn } from "@/lib/assistant-router";
import { mergeFinalProposal } from "@/lib/proposal-merge";
import { shouldAutoApplyBoundIntake } from "@/lib/proposal-scope";
import { formatProposeAppliedReply, formatProposeWecomReply } from "@/lib/proposal-wecom-format";
import { registerWecomChat } from "@/lib/wecom-chats";
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
  sourceText: string;
};

const proposeSessions = new Map<string, ProposeSession>();

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

function withPartnerHint(
  history: IntakeMessage[],
  boundPartnerId?: string | null,
  boundPartnerName?: string | null
): IntakeMessage[] {
  if (!boundPartnerId || !boundPartnerName || !history.length) return history;
  const last = history[history.length - 1];
  if (last.role !== "user") return history;
  return [
    ...history.slice(0, -1),
    {
      role: "user" as const,
      content:
        last.content +
        `\n\n（系统提示：当前会话已绑定伙伴「${boundPartnerName}」。商务记录、商机、联系人、培训、联合方案等均默认归属该伙伴；「这个伙伴/该客户」均指该伙伴。）`,
    },
  ];
}

async function refreshAiSummary() {
  aiSummaryCache = await getAiConfigSummary();
  status.ai = aiSummaryCache;
  return aiSummaryCache;
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
    console.log(
      `[wecom-bot] 群聊已登记 chatId=${chat.chatId}` +
        (chat.partner ? ` 已绑定伙伴=${chat.partner.name}` : " 尚未绑定伙伴")
    );
  }

  const key = chatKey(frame);
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
  const session = proposeSessions.get(key);

  try {
    if (session && isProposeCancel(text)) {
      proposeSessions.delete(key);
      const reply = "已取消，未保存任何草案内容。你可以继续正常提问，或重新发起录入。";
      appendHistory(key, "assistant", reply);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    if (session && isProposeConfirm(text)) {
      if (!session.ready) {
        const reply = "草案信息还不够完整，请继续补充细节后再回复「确认」保存，或回复「取消」放弃。";
        appendHistory(key, "assistant", reply);
        await wsClient.replyStream(frame, streamId, reply, true);
        return;
      }
      const applied = await applyIntake({
        scope: session.scope,
        partnerId: boundPartnerId ?? session.partnerId,
        proposal: session.proposal,
        userId: botUserId,
        sourceText: session.sourceText,
        locale: "zh",
      });
      proposeSessions.delete(key);
      const reply = formatProposeAppliedReply(applied.applied, applied.partnerId, session.scope);
      appendHistory(key, "assistant", reply);
      console.log(`[wecom-bot] Propose 已保存 scope=${session.scope} partner=${applied.partnerId.slice(0, 8)}…`);
      await wsClient.replyStream(frame, streamId, reply, true);
      return;
    }

    const messages = withPartnerHint(history, boundPartnerId, boundPartnerName);
    const inPropose = !!session || shouldUseProposeMode(messages);

    const result = await runAssistantTurn({
      messages,
      userId: botUserId,
      partnerId: boundPartnerId ?? session?.partnerId,
      locale: "zh",
      feature: inPropose ? "WeCom Bot · Propose" : "WeCom Bot",
      forcePropose: inPropose,
      proposeScope: session?.scope,
    });

    let reply: string;
    if (result.mode === "propose") {
      const merged = mergeFinalProposal(session?.proposal ?? null, result.proposal, new Set());
      const sourceText = history
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n");
      const scope = session?.scope ?? result.scope;
      const partnerId = boundPartnerId ?? session?.partnerId;

      if (
        shouldAutoApplyBoundIntake({
          scope,
          partnerId,
          ready: result.ready,
          clarifications: result.clarifications,
          proposal: merged,
        })
      ) {
        const applied = await applyIntake({
          scope,
          partnerId,
          proposal: merged,
          userId: botUserId,
          sourceText,
          locale: "zh",
        });
        proposeSessions.delete(key);
        reply = `${result.reply.trim()}\n\n${formatProposeAppliedReply(applied.applied, applied.partnerId, scope)}`;
        console.log(`[wecom-bot] 绑定伙伴自动保存 scope=${scope} partner=${applied.partnerId.slice(0, 8)}…`);
      } else {
        proposeSessions.set(key, {
          scope,
          partnerId,
          proposal: merged,
          ready: result.ready,
          sourceText,
        });
        reply = formatProposeWecomReply({
          scope: result.scope,
          reply: result.reply,
          proposal: merged,
          ready: result.ready,
          questions: result.questions,
        });
        console.log(`[wecom-bot] Propose(${result.scope}) ready=${result.ready}`);
      }
    } else {
      if (session && !shouldUseProposeMode(messages)) {
        // User pivoted to a normal query — drop stale draft
        proposeSessions.delete(key);
      }
      reply = result.reply;
      console.log(`[wecom-bot] 回复(${text.slice(0, 20)}…): ${result.reply.slice(0, 120)}…`);
    }

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
          "你好！我是帆软中东伙伴管理助手。\n\n你可以：\n• 查询：当前有哪些 Tier A 伙伴？某伙伴档案？\n• 指令：推进阶段、创建待办\n• 录入（协作 Agent）：\n  - 记录商务进展 / 拜访 / 会议纪要\n  - 添加商机、联系人\n  - 建档 / 补全画像（可贴 KMS 链接）\n  录入时会先给出草案，回复「确认」保存，「取消」放弃。\n\n直接发消息即可开始。",
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
