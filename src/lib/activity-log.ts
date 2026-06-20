import { db } from "./db";

const MAX_TEXT = 12000;

function truncateText(text: string, max = MAX_TEXT): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…（已截断，共 ${t.length} 字）`;
}

function safeJson(meta: Record<string, unknown> | undefined): string | null {
  if (!meta || !Object.keys(meta).length) return null;
  try {
    return JSON.stringify(meta);
  } catch {
    return null;
  }
}

export type AiConversationChannel = "WEB" | "WECOM";

export async function recordAiConversation(opts: {
  userId?: string | null;
  channel?: AiConversationChannel;
  feature: string;
  mode?: string | null;
  userMessage: string;
  assistantReply?: string | null;
  partnerId?: string | null;
  status?: "SUCCESS" | "FAILED";
  error?: string | null;
  durationMs?: number | null;
  meta?: Record<string, unknown>;
}) {
  const userMessage = truncateText(opts.userMessage || "（空消息）");
  if (!userMessage) return;
  try {
    await db.aiConversationLog.create({
      data: {
        userId: opts.userId ?? null,
        channel: opts.channel ?? "WEB",
        feature: opts.feature,
        mode: opts.mode ?? null,
        userMessage,
        assistantReply: opts.assistantReply ? truncateText(opts.assistantReply) : null,
        partnerId: opts.partnerId ?? null,
        status: opts.status ?? "SUCCESS",
        error: opts.error ? truncateText(opts.error, 2000) : null,
        durationMs: opts.durationMs ?? null,
        meta: safeJson(opts.meta),
      },
    });
  } catch (e) {
    console.error("[activity-log] recordAiConversation failed:", e);
  }
}

export async function recordSystemEvent(opts: {
  category: string;
  action: string;
  actorId?: string | null;
  actorLabel?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary?: string | null;
  detail?: string | null;
  meta?: Record<string, unknown>;
  status?: "SUCCESS" | "FAILED";
}) {
  try {
    await db.systemEventLog.create({
      data: {
        category: opts.category,
        action: opts.action,
        actorId: opts.actorId ?? null,
        actorLabel: opts.actorLabel ?? null,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        targetLabel: opts.targetLabel ?? null,
        summary: opts.summary ? truncateText(opts.summary, 500) : null,
        detail: opts.detail ? truncateText(opts.detail, 4000) : null,
        meta: safeJson(opts.meta),
        status: opts.status ?? "SUCCESS",
      },
    });
  } catch (e) {
    console.error("[activity-log] recordSystemEvent failed:", e);
  }
}

export function channelFromFeature(feature: string): AiConversationChannel {
  return feature.startsWith("WeCom") ? "WECOM" : "WEB";
}

export function replyFromAssistantTurn(result: { mode: string; reply?: string }): string {
  return typeof result.reply === "string" ? result.reply : "";
}

export function modeFromAssistantTurn(result: { mode: string }): string {
  return result.mode;
}

export async function logStandaloneAiTurn(opts: {
  userId: string;
  feature: string;
  mode: string;
  messages: Array<{ role: string; content: string }>;
  reply: string;
  durationMs?: number;
  status?: "SUCCESS" | "FAILED";
  error?: string;
}) {
  const userMessage =
    [...opts.messages].reverse().find((m) => m.role === "user")?.content?.trim() || "（空消息）";
  await recordAiConversation({
    userId: opts.userId,
    channel: "WEB",
    feature: opts.feature,
    mode: opts.mode,
    userMessage,
    assistantReply: opts.reply,
    durationMs: opts.durationMs,
    status: opts.status,
    error: opts.error,
  });
}

export async function getActivityLogStats() {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const [aiToday, aiWeek, sysToday, sysWeek] = await Promise.all([
    db.aiConversationLog.count({
      where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    }),
    db.aiConversationLog.count({ where: { createdAt: { gte: since } } }),
    db.systemEventLog.count({
      where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    }),
    db.systemEventLog.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { aiToday, aiWeek, sysToday, sysWeek };
}
