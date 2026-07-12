import { db } from "./db";
import {
  addLocalDays,
  getZonedParts,
  resolveAgentTimezone,
  zonedLocalToUtc,
} from "./cron";

/** 周报自动化在 Agent 表里的固定 slug */
export const WEEKLY_REPORT_SLUG = "weekly-personal-report";

export const DEFAULT_WEEKLY_REPORT_ROLES = ["SALES", "PRESALES"];
export const DEFAULT_WEEKLY_REPORT_MANAGERS = ["saber", "zayne", "sean.song", "lican"];
export const DEFAULT_WEEKLY_REPORT_CRON = "0 0 * * 5"; // 利雅得周四晚 12 点 = 周五 00:00
export const DEFAULT_WEEKLY_REPORT_TZ = "Asia/Riyadh";

import type { WeeklyReportLocale } from "./weekly-report-locale";

/** 周报自动化配置，存在 agent.queryConfig（JSON 字符串）里 */
export type WeeklyReportConfig = {
  source: "weekly_review";
  /** 收周报的人按角色筛选（默认 SALES + PRESALES） */
  roles: string[];
  /** 管理者汇总收件人：用户名 / 显示名 / 邮箱前缀 / 邮箱，运行时解析为邮箱 */
  managers: string[];
  /** 个人周报使用英文的成员标识（用户名 / 显示名 / 邮箱前缀），优先级高于用户偏好 */
  englishRecipients?: string[];
  /** 未单独配置语言时的团队默认（默认 zh） */
  defaultReportLocale?: WeeklyReportLocale;
  /** 管理者汇总邮件语言（默认 zh） */
  managerDigestLocale?: WeeklyReportLocale;
  /** 没有任何活动的人是否也发（默认 false：静默的人不打扰，但仍计入管理者汇总） */
  includeInactive?: boolean;
};

export function parseWeeklyReportConfig(raw: unknown): WeeklyReportConfig | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      obj = JSON.parse(t) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else {
    return null;
  }
  if (obj.source !== "weekly_review") return null;
  const roles = Array.isArray(obj.roles)
    ? (obj.roles as unknown[]).map((r) => String(r).trim().toUpperCase()).filter(Boolean)
    : [];
  const managers = Array.isArray(obj.managers)
    ? (obj.managers as unknown[]).map((m) => String(m).trim()).filter(Boolean)
    : [];
  const englishRecipients = Array.isArray(obj.englishRecipients)
    ? (obj.englishRecipients as unknown[]).map((m) => String(m).trim()).filter(Boolean)
    : [];
  const defaultReportLocale =
    obj.defaultReportLocale === "en" || obj.defaultReportLocale === "zh" ? obj.defaultReportLocale : undefined;
  const managerDigestLocale =
    obj.managerDigestLocale === "en" || obj.managerDigestLocale === "zh" ? obj.managerDigestLocale : undefined;
  return {
    source: "weekly_review",
    roles: roles.length ? roles : [...DEFAULT_WEEKLY_REPORT_ROLES],
    managers,
    englishRecipients,
    defaultReportLocale,
    managerDigestLocale,
    includeInactive: obj.includeInactive === true,
  };
}

export function serializeWeeklyReportConfig(config: WeeklyReportConfig): string {
  return JSON.stringify({
    source: "weekly_review",
    roles: config.roles,
    managers: config.managers,
    englishRecipients: config.englishRecipients ?? [],
    defaultReportLocale: config.defaultReportLocale,
    managerDigestLocale: config.managerDigestLocale,
    includeInactive: !!config.includeInactive,
  });
}

export function isWeeklyReportAgent(agent: { queryConfig: string | null }): boolean {
  return parseWeeklyReportConfig(agent.queryConfig) !== null;
}

// ============ 时间窗（中东工作周：周日 00:00 → 运行时刻） ============

export type WeekWindow = { start: Date; end: Date; label: string };

/** 从「现在」回溯到本工作周的周日 00:00（业务时区），窗口结束为现在 */
export function computeWorkWeekWindow(now: Date, timeZone: string): WeekWindow {
  const tz = resolveAgentTimezone(timeZone);
  const p = getZonedParts(now, tz);
  let { year, month, day } = p;
  let wd = p.weekday; // 0=周日
  let guard = 0;
  while (wd !== 0 && guard < 8) {
    ({ year, month, day } = addLocalDays(year, month, day, -1, tz));
    wd = getZonedParts(zonedLocalToUtc({ year, month, day, hour: 12, minute: 0 }, tz), tz).weekday;
    guard++;
  }
  const start = zonedLocalToUtc({ year, month, day, hour: 0, minute: 0 }, tz);
  const fmt = (d: Date) => {
    const z = getZonedParts(d, tz);
    return `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
  };
  return { start, end: now, label: `${fmt(start)} ~ ${fmt(now)}` };
}

// ============ 收件人解析 ============

export type ResolvedTargetUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  reportLocale: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
};

const USER_LOCALE_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  reportLocale: true,
  wecomDisplayName: true,
  crmSalesmanName: true,
} as const;

type UserLookupRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  reportLocale?: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
};

function matchUserByToken(users: UserLookupRow[], token: string): UserLookupRow | undefined {
  const lower = token.toLowerCase();
  return (
    users.find((u) => u.name?.toLowerCase() === lower) ??
    users.find((u) => u.email?.toLowerCase().split("@")[0] === lower) ??
    users.find((u) => u.wecomDisplayName?.toLowerCase() === lower) ??
    users.find((u) => u.crmSalesmanName?.toLowerCase() === lower) ??
    users.find((u) => u.name?.toLowerCase().includes(lower)) ??
    users.find((u) => u.wecomDisplayName?.toLowerCase().includes(lower)) ??
    users.find((u) => u.email?.toLowerCase().includes(lower))
  );
}

export async function resolveTargetUsers(roles: string[]): Promise<ResolvedTargetUser[]> {
  return db.user.findMany({
    where: { role: { in: roles } },
    select: USER_LOCALE_SELECT,
    orderBy: { name: "asc" },
  });
}

/** 把管理者标识解析为 Hub 用户（用于生成其个人周报） */
export async function resolveManagerUsers(tokens: string[]): Promise<ResolvedTargetUser[]> {
  if (!tokens.length) return [];
  const users = await db.user.findMany({ select: USER_LOCALE_SELECT });
  const found: ResolvedTargetUser[] = [];
  const seen = new Set<string>();
  for (const tokenRaw of tokens) {
    const token = tokenRaw.trim();
    if (!token || token.includes("@")) continue;
    const match = matchUserByToken(users, token);
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      found.push({ ...match, reportLocale: match.reportLocale ?? null });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** 角色成员 + 管理者去重合并（管理者即使非销售/售前也会收到个人周报） */
export function mergeWeeklyReportUsers(
  roleUsers: ResolvedTargetUser[],
  managerUsers: ResolvedTargetUser[]
): ResolvedTargetUser[] {
  const seen = new Set<string>();
  const merged: ResolvedTargetUser[] = [];
  for (const u of [...roleUsers, ...managerUsers]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    merged.push(u);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

/** 把「saber / zayne / sean.song」等标识解析成用户邮箱 */
export async function resolveManagerEmails(
  tokens: string[]
): Promise<{ emails: string[]; resolved: { token: string; email: string | null; name: string | null }[] }> {
  const resolved: { token: string; email: string | null; name: string | null }[] = [];
  if (!tokens.length) return { emails: [], resolved };
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, wecomDisplayName: true, crmSalesmanName: true },
  });
  const emails = new Set<string>();
  for (const tokenRaw of tokens) {
    const token = tokenRaw.trim();
    if (!token) continue;
    if (token.includes("@")) {
      emails.add(token);
      resolved.push({ token, email: token, name: null });
      continue;
    }
    const match = matchUserByToken(users, token);
    if (match?.email) {
      emails.add(match.email);
      resolved.push({ token, email: match.email, name: match.name });
    } else {
      resolved.push({ token, email: null, name: match?.name ?? null });
    }
  }
  return { emails: [...emails], resolved };
}
