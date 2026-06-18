import AiBot from "@wecom/aibot-node-sdk";
import { generateReqId } from "@wecom/aibot-node-sdk";
import type { WsFrame } from "@wecom/aibot-node-sdk";
import { db } from "@/lib/db";
import { AIError, getAiConfigSummary, type AiConfigSummary } from "@/lib/ai";
import { runQueryAssistant } from "@/lib/assistant-core";
import type { IntakeMessage } from "@/lib/ai-intake";

const MAX_HISTORY = 20;
const conversations = new Map<string, IntakeMessage[]>();

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

async function refreshAiSummary() {
  aiSummaryCache = await getAiConfigSummary();
  status.ai = aiSummaryCache;
  return aiSummaryCache;
}

async function handleTextMessage(frame: WsFrame) {
  if (!wsClient || !botUserId) return;
  const text = frame.body?.text?.content?.trim();
  if (!text) return;

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

  try {
    const result = await runQueryAssistant(history, botUserId, {
      locale: "zh",
      feature: "WeCom Bot",
    });
    appendHistory(key, "assistant", result.reply);
    console.log(`[wecom-bot] 回复(${text.slice(0, 20)}…): ${result.reply.slice(0, 120)}…`);
    await wsClient.replyStream(frame, streamId, result.reply, true);
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
          "你好！我是帆软中东伙伴管理助手。\n\n你可以问我：\n• 当前有哪些 Tier A 伙伴？\n• 帮我把某伙伴推进到下一阶段\n• 创建一条待办\n• 对比两个伙伴的档案\n\n直接发消息即可开始对话。",
      },
    });
  });

  wsClient.connect();
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
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
  status.connected = false;
  status.authenticated = false;
  console.log("[wecom-bot] 已停止");
}
