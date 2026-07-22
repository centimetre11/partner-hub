import { NextResponse } from "next/server";
import {
  getActivityLogTotals,
  getUserBehaviorTotals,
  queryAiConversationLogs,
  querySystemEventLogs,
  queryUserBehaviorLogs,
} from "@/lib/activity-log";
import { requireSuperAdmin } from "@/lib/session";

export async function GET(req: Request) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "ai";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const status = url.searchParams.get("status") ?? "ALL";
  const search = url.searchParams.get("search") ?? "";

  if (type === "totals") {
    const totals = await getActivityLogTotals();
    return NextResponse.json(totals);
  }

  if (type === "behavior_totals") {
    const totals = await getUserBehaviorTotals();
    return NextResponse.json(totals);
  }

  if (type === "behavior") {
    const eventType = url.searchParams.get("eventType") ?? "ALL";
    const action = url.searchParams.get("action") ?? "";
    const pagePath = url.searchParams.get("pagePath") ?? "";
    const project = url.searchParams.get("project") ?? "ALL";
    const userId = url.searchParams.get("userId") ?? "";
    const result = await queryUserBehaviorLogs(page, { eventType, action, pagePath, search, project, userId });
    return NextResponse.json({
      items: result.items.map((row) => ({
        id: row.id,
        project: row.project,
        eventType: row.eventType,
        action: row.action,
        pagePath: row.pagePath,
        targetType: row.targetType,
        targetId: row.targetId,
        targetLabel: row.targetLabel,
        status: row.status,
        durationMs: row.durationMs,
        createdAt: row.createdAt.toISOString(),
        user: row.user,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  }

  if (type === "system") {
    const category = url.searchParams.get("category") ?? "ALL";
    const result = await querySystemEventLogs(page, { category, status, search });
    return NextResponse.json({
      items: result.items.map((row) => ({
        id: row.id,
        category: row.category,
        action: row.action,
        actorLabel: row.actorLabel,
        targetType: row.targetType,
        targetLabel: row.targetLabel,
        summary: row.summary,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        actor: row.actor,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  }

  const channel = url.searchParams.get("channel") ?? "ALL";
  const result = await queryAiConversationLogs(page, { channel, status, search });
  return NextResponse.json({
    items: result.items.map((row) => ({
      id: row.id,
      channel: row.channel,
      feature: row.feature,
      mode: row.mode,
      userMessage: row.userMessage,
      status: row.status,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
      user: row.user,
      partner: row.partner,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
}
