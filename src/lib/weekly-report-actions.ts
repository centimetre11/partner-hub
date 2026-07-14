"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSuperAdmin } from "./session";
import { computeNextRunAt } from "./agent-runner";
import { cronToAgentSchedule, describeCron, resolveAgentTimezone } from "./cron";
import {
  WEEKLY_REPORT_SLUG,
  DEFAULT_WEEKLY_REPORT_ROLES,
  DEFAULT_WEEKLY_REPORT_MANAGERS,
  DEFAULT_WEEKLY_REPORT_CRON,
  DEFAULT_WEEKLY_REPORT_TZ,
  parseWeeklyReportConfig,
  serializeWeeklyReportConfig,
  resolveTargetUsers,
  resolveManagerUsers,
  mergeWeeklyReportUsers,
  resolveManagerEmails,
  type WeeklyReportConfig,
} from "./weekly-report-config";
import { isEmailServiceConfigured } from "./email-config";

export type WeeklyReportStatus = {
  exists: boolean;
  enabled: boolean;
  cronExpr: string;
  timezone: string;
  scheduleLabel: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  roles: string[];
  managers: string[];
  englishRecipients: string[];
  includeInactive: boolean;
  resolvedManagers: { token: string; email: string | null; name: string | null }[];
  targetUsers: { id: string; name: string; email: string | null; role: string }[];
  emailConfigured: boolean;
};

async function loadAgent() {
  return db.agent.findFirst({ where: { slug: WEEKLY_REPORT_SLUG } });
}

function parseList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getWeeklyReportStatusAction(): Promise<WeeklyReportStatus> {
  await requireSuperAdmin();
  const agent = await loadAgent();
  const config: WeeklyReportConfig =
    parseWeeklyReportConfig(agent?.queryConfig) ?? {
      source: "weekly_review",
      roles: [...DEFAULT_WEEKLY_REPORT_ROLES],
      managers: [...DEFAULT_WEEKLY_REPORT_MANAGERS],
      includeInactive: false,
    };
  const cronExpr = agent?.cronExpr || DEFAULT_WEEKLY_REPORT_CRON;
  const timezone = resolveAgentTimezone(agent?.timezone || DEFAULT_WEEKLY_REPORT_TZ);

  const [roleUsers, managerUsers, { resolved }, emailConfigured] = await Promise.all([
    resolveTargetUsers(config.roles),
    resolveManagerUsers(config.managers),
    resolveManagerEmails(config.managers),
    isEmailServiceConfigured(),
  ]);
  const targetUsers = mergeWeeklyReportUsers(roleUsers, managerUsers);

  return {
    exists: !!agent,
    enabled: agent?.enabled ?? false,
    cronExpr,
    timezone,
    scheduleLabel: describeCron(cronExpr, "zh"),
    nextRunAt: agent?.nextRunAt?.toISOString() ?? null,
    lastRunAt: agent?.lastRunAt?.toISOString() ?? null,
    roles: config.roles,
    managers: config.managers,
    englishRecipients: config.englishRecipients ?? [],
    includeInactive: !!config.includeInactive,
    resolvedManagers: resolved,
    targetUsers,
    emailConfigured,
  };
}

export async function saveWeeklyReportConfigAction(formData: FormData) {
  const admin = await requireSuperAdmin();

  const roles = parseList(formData.get("roles")).map((r) => r.toUpperCase());
  const managers = parseList(formData.get("managers"));
  const englishRecipients = parseList(formData.get("englishRecipients"));
  const includeInactive = formData.get("includeInactive") === "true";
  const enabled = formData.get("enabled") !== "false";
  const cronExpr = String(formData.get("cronExpr") ?? "").trim() || DEFAULT_WEEKLY_REPORT_CRON;
  const timezone = resolveAgentTimezone(String(formData.get("timezone") ?? "").trim() || DEFAULT_WEEKLY_REPORT_TZ);

  if (!roles.length) return { error: "请至少选择一个收报角色" };

  const config: WeeklyReportConfig = {
    source: "weekly_review",
    roles,
    managers,
    englishRecipients,
    includeInactive,
  };
  const queryConfig = serializeWeeklyReportConfig(config);
  const schedule = cronToAgentSchedule(cronExpr);

  const base = {
    name: "每周个人工作周报",
    icon: "📊",
    description:
      "每周自动汇总每个销售/售前本周完成的待办、商务记录、新增客户，AI 生成下周计划建议，发到个人邮箱；并向管理者发送团队汇总。",
    instructions:
      "周报自动化（专用管道）：按角色圈定用户 → 逐人聚合本周（周日 00:00 至运行时刻，利雅得时区）数据 → AI 写小结与下周建议 → 发个人邮件 → 给管理者发团队汇总。配置见 queryConfig。",
    skills: JSON.stringify(["send_email"]),
    trigger: "SCHEDULE",
    frequency: schedule.frequency,
    runHour: schedule.runHour,
    runWeekday: schedule.runWeekday,
    cronExpr,
    timezone,
    queryConfig,
    isAutomation: true,
    isTemplate: false,
    shared: true,
    enabled,
    notifyOnSuccess: true,
    notifyOnFailure: true,
    scopeType: "ALL" as const,
    maxIterations: 30,
    timeoutMinutes: 60,
  };

  const existing = await loadAgent();
  let agentId: string;
  if (existing) {
    await db.agent.update({ where: { id: existing.id }, data: base });
    agentId = existing.id;
  } else {
    const created = await db.agent.create({
      data: { slug: WEEKLY_REPORT_SLUG, createdById: admin.id, ...base },
    });
    agentId = created.id;
  }

  const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
  const nextRunAt = enabled ? computeNextRunAt(agent) : null;
  await db.agent.update({ where: { id: agentId }, data: { nextRunAt } });

  revalidatePath("/settings");
  revalidatePath("/ops");
  revalidatePath("/ops/weekly-report");
  return {
    ok: true,
    message: enabled
      ? `已保存。下次运行：${nextRunAt ? nextRunAt.toLocaleString("zh-CN", { timeZone: timezone }) : "—"}（${timezone}）`
      : "已保存并停用（不会自动运行）",
  };
}

export async function runWeeklyReportNowAction() {
  await requireSuperAdmin();
  const agent = await loadAgent();
  if (!agent) return { error: "请先保存周报配置" };
  if (!(await isEmailServiceConfigured())) {
    return { error: "邮件服务未配置，请先在「系统邮件服务」中配置 QQ 邮箱 SMTP" };
  }
  try {
    const { runAgent } = await import("./agent-runner");
    const output = await runAgent(agent.id, "manual");
    revalidatePath("/settings");
    revalidatePath("/ops");
    revalidatePath("/ops/weekly-report");
    const tail = output.split("**推送结果：**")[1]?.trim();
    return { ok: true, message: `已运行。${tail ? `推送结果：${tail}` : "详见自动化运行记录。"}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendWeeklyReportTestAction(formData: FormData) {
  await requireSuperAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const emailOverride = String(formData.get("emailOverride") ?? "").trim();
  if (!userId) return { error: "请选择一个要试发的成员" };
  if (!(await isEmailServiceConfigured())) {
    return { error: "邮件服务未配置，请先在「系统邮件服务」中配置 QQ 邮箱 SMTP" };
  }
  const agent = await loadAgent();
  const timezone = resolveAgentTimezone(agent?.timezone || DEFAULT_WEEKLY_REPORT_TZ);
  try {
    const { sendSingleUserReport } = await import("./weekly-report");
    const res = await sendSingleUserReport({
      userId,
      toEmailOverride: emailOverride || undefined,
      timezone,
      creatorId: agent?.createdById ?? null,
      agentConfig: agent?.queryConfig ?? null,
    });
    return res.ok ? { ok: true, message: res.message } : { error: res.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
