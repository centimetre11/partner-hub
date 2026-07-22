import { db } from "./db";
import { enqueueLog } from "./tracking/batch-writer";

const MAX_TEXT = 12000;

export function truncateText(text: string, max = MAX_TEXT): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…（已截断，共 ${t.length} 字）`;
}

export function safeJson(meta: Record<string, unknown> | undefined | null): string | null {
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
  project?: string | null;
  ipHash?: string | null;
  durationMs?: number | null;
}) {
  try {
    enqueueLog("systemEventLog", {
      project: opts.project ?? "partner-hub",
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
      ipHash: opts.ipHash ?? null,
      durationMs: opts.durationMs ?? null,
      status: opts.status ?? "SUCCESS",
    });
  } catch (e) {
    console.error("[activity-log] recordSystemEvent failed:", e);
  }
}

export type UserBehaviorEventType =
  | "PAGE_VIEW"
  | "CLICK"
  | "SUBMIT"
  | "SEARCH"
  | "FILTER"
  | "ERROR"
  | "STAY"
  | "SERVER_ACTION";

export async function recordUserBehavior(opts: {
  project?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  eventType: UserBehaviorEventType;
  action: string;
  pagePath?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  meta?: Record<string, unknown>;
  ipHash?: string | null;
  durationMs?: number | null;
  status?: "SUCCESS" | "FAILED";
}) {
  try {
    enqueueLog("userBehaviorLog", {
      project: opts.project ?? "partner-hub",
      userId: opts.userId ?? null,
      sessionId: opts.sessionId ?? null,
      eventType: opts.eventType,
      action: opts.action,
      pagePath: opts.pagePath ?? null,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      targetLabel: opts.targetLabel ? truncateText(opts.targetLabel, 500) : null,
      meta: safeJson(opts.meta),
      ipHash: opts.ipHash ?? null,
      durationMs: opts.durationMs ?? null,
      status: opts.status ?? "SUCCESS",
    });
  } catch (e) {
    console.error("[activity-log] recordUserBehavior failed:", e);
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

const PAGE_SIZE = 10;

export type AiLogFilters = {
  channel?: string;
  status?: string;
  search?: string;
};

export type SystemLogFilters = {
  category?: string;
  status?: string;
  search?: string;
};

export async function queryAiConversationLogs(page: number, filters: AiLogFilters = {}) {
  const where: Record<string, unknown> = {};
  if (filters.channel && filters.channel !== "ALL") where.channel = filters.channel;
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.search?.trim()) {
    where.userMessage = { contains: filters.search.trim() };
  }

  const skip = Math.max(0, (page - 1) * PAGE_SIZE);
  const [items, total] = await Promise.all([
    db.aiConversationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        user: { select: { name: true, email: true } },
        partner: { select: { name: true } },
      },
    }),
    db.aiConversationLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function querySystemEventLogs(page: number, filters: SystemLogFilters = {}) {
  const where: Record<string, unknown> = {};
  if (filters.category && filters.category !== "ALL") where.category = filters.category;
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { summary: { contains: q } },
      { action: { contains: q } },
      { actorLabel: { contains: q } },
      { targetLabel: { contains: q } },
    ];
  }

  const skip = Math.max(0, (page - 1) * PAGE_SIZE);
  const [items, total] = await Promise.all([
    db.systemEventLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        actor: { select: { name: true } },
      },
    }),
    db.systemEventLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getActivityLogTotals() {
  const [aiTotal, systemTotal] = await Promise.all([
    db.aiConversationLog.count(),
    db.systemEventLog.count(),
  ]);
  return { aiTotal, systemTotal };
}

export type UserBehaviorLogFilters = {
  eventType?: string;
  action?: string;
  pagePath?: string;
  search?: string;
  project?: string;
};

export async function queryUserBehaviorLogs(page: number, filters: UserBehaviorLogFilters = {}) {
  const where: Record<string, unknown> = {};
  if (filters.eventType && filters.eventType !== "ALL") where.eventType = filters.eventType;
  if (filters.action?.trim()) where.action = { contains: filters.action.trim() };
  if (filters.pagePath?.trim()) where.pagePath = { contains: filters.pagePath.trim() };
  if (filters.project && filters.project !== "ALL") where.project = filters.project;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { action: { contains: q } },
      { pagePath: { contains: q } },
      { targetLabel: { contains: q } },
      { targetId: { contains: q } },
    ];
  }

  const skip = Math.max(0, (page - 1) * PAGE_SIZE);
  const [items, total] = await Promise.all([
    db.userBehaviorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.userBehaviorLog.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getUserBehaviorTotals() {
  const [total, today, week] = await Promise.all([
    db.userBehaviorLog.count(),
    db.userBehaviorLog.count({
      where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    }),
    db.userBehaviorLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  return { total, today, week };
}

export async function getBehaviorStats(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [total, totalUsers, totalSessions, dailyRows, topPages, topActions, eventTypes] = await Promise.all([
    db.userBehaviorLog.count({ where: { createdAt: { gte: since } } }),
    db.userBehaviorLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since }, userId: { not: null } },
      _count: { userId: true },
    }).then((rows) => rows.length),
    db.userBehaviorLog.groupBy({
      by: ["sessionId"],
      where: { createdAt: { gte: since }, sessionId: { not: null } },
      _count: { sessionId: true },
    }).then((rows) => rows.length),
    db.$queryRawUnsafe<Array<{ day: string; count: number; users: number }>>(
      `SELECT strftime('%Y-%m-%d', createdAt) as day, COUNT(*) as count, COUNT(DISTINCT userId) as users
       FROM UserBehaviorLog
       WHERE createdAt >= ?
       GROUP BY day
       ORDER BY day ASC`,
      sinceIso
    ),
    db.userBehaviorLog.groupBy({
      by: ["pagePath"],
      where: { createdAt: { gte: since }, eventType: "PAGE_VIEW" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
    db.userBehaviorLog.groupBy({
      by: ["action"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
    db.userBehaviorLog.groupBy({
      by: ["eventType"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  return { total, totalUsers, totalSessions, dailyRows, topPages, topActions, eventTypes };
}
