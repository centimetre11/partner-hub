/**
 * 创建/更新「每周个人工作周报」自动化（幂等，按 slug 复用）。
 *
 * 运行：在已配置 DATABASE_URL（线上 Postgres）的环境下执行
 *   npx tsx scripts/setup-weekly-report.ts
 *
 * 可选环境变量覆盖：
 *   WEEKLY_MANAGERS  逗号分隔的管理者标识（用户名/显示名/邮箱），默认 saber,zayne,sean.song
 *   WEEKLY_ROLES     逗号分隔的角色，默认 SALES,PRESALES
 *   WEEKLY_CRON      cron 表达式，默认 "0 0 * * 5"（利雅得周四晚 12 点 = 周五 00:00）
 *   WEEKLY_TZ        时区，默认 Asia/Riyadh
 */
import { db } from "../src/lib/db";
import { computeNextRunAt } from "../src/lib/agent-runner";

// 注意：不直接 import weekly-report.ts（其含 "server-only"，在 tsx 脚本下会报错）。
// 配置结构与 weekly-report.ts 的 WeeklyReportConfig 保持一致。
const DEFAULT_WEEKLY_REPORT_ROLES = ["SALES", "PRESALES"];

const SLUG = "weekly-personal-report";

function listFromEnv(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function resolveCreatorId(managers: string[]): Promise<string | null> {
  // 优先：第一个管理者标识对应的用户；其次任意 ADMIN；最后任意用户
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, wecomDisplayName: true },
  });
  for (const token of managers) {
    const lower = token.toLowerCase();
    const m =
      users.find((u) => u.name?.toLowerCase() === lower) ??
      users.find((u) => u.email?.toLowerCase().split("@")[0] === lower) ??
      users.find((u) => u.wecomDisplayName?.toLowerCase() === lower) ??
      users.find((u) => u.name?.toLowerCase().includes(lower));
    if (m) return m.id;
  }
  const admin = users.find((u) => u.role === "ADMIN");
  return admin?.id ?? users[0]?.id ?? null;
}

async function main() {
  const managers = listFromEnv("WEEKLY_MANAGERS", ["saber", "zayne", "sean.song"]);
  const roles = listFromEnv("WEEKLY_ROLES", [...DEFAULT_WEEKLY_REPORT_ROLES]).map((r) => r.toUpperCase());
  const cronExpr = process.env.WEEKLY_CRON?.trim() || "0 0 * * 5";
  const timezone = process.env.WEEKLY_TZ?.trim() || "Asia/Riyadh";

  const queryConfig = JSON.stringify({ source: "weekly_review", roles, managers });
  const createdById = await resolveCreatorId(managers);

  const base = {
    name: "每周个人工作周报",
    icon: "📊",
    description:
      "每周自动汇总每个销售/售前本周完成的待办、商务记录、新增客户，AI 生成下周计划建议，发到个人邮箱；并向管理者发送团队汇总。",
    instructions:
      "周报自动化（专用管道）：按角色圈定用户 → 逐人聚合本周（周日 00:00 至运行时刻，利雅得时区）数据 → AI 写小结与下周建议 → 发个人邮件 → 给管理者发团队汇总。配置见 queryConfig。",
    skills: JSON.stringify(["send_email"]),
    trigger: "SCHEDULE",
    frequency: "WEEKLY",
    runHour: 0,
    runWeekday: 5,
    cronExpr,
    timezone,
    queryConfig,
    isAutomation: true,
    isTemplate: false,
    shared: true,
    enabled: true,
    notifyOnSuccess: true,
    notifyOnFailure: true,
    scopeType: "ALL",
    maxIterations: 30,
    timeoutMinutes: 60,
  } as const;

  const existing = await db.agent.findFirst({ where: { slug: SLUG } });
  let agentId: string;
  if (existing) {
    await db.agent.update({ where: { id: existing.id }, data: { ...base } });
    agentId = existing.id;
    console.log(`[setup-weekly-report] Updated existing automation (id=${agentId})`);
  } else {
    const created = await db.agent.create({
      data: { slug: SLUG, createdById, ...base },
    });
    agentId = created.id;
    console.log(`[setup-weekly-report] Created automation (id=${agentId})`);
  }

  const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
  const nextRunAt = computeNextRunAt(agent);
  await db.agent.update({ where: { id: agentId }, data: { nextRunAt } });

  // 健康检查：解析目标用户与管理者收件人
  const targetUsers = await db.user.findMany({
    where: { role: { in: roles } },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });
  const allUsers = await db.user.findMany({
    select: { name: true, email: true, wecomDisplayName: true, crmSalesmanName: true },
  });
  const resolvedManagers = managers.map((token) => {
    if (token.includes("@")) return `${token} → ${token}`;
    const lower = token.toLowerCase();
    const m =
      allUsers.find((u) => u.name?.toLowerCase() === lower) ??
      allUsers.find((u) => u.email?.toLowerCase().split("@")[0] === lower) ??
      allUsers.find((u) => u.wecomDisplayName?.toLowerCase() === lower) ??
      allUsers.find((u) => u.crmSalesmanName?.toLowerCase() === lower) ??
      allUsers.find((u) => u.name?.toLowerCase().includes(lower));
    return `${token} → ${m?.email ?? "❌ 未解析"}`;
  });

  console.log("\n=== 周报自动化已就绪 ===");
  console.log(`名称：${base.name}`);
  console.log(`调度：${cronExpr}（${timezone}）`);
  console.log(`下次运行：${nextRunAt?.toISOString() ?? "null"}`);
  console.log(`目标角色：${roles.join(", ")}`);
  console.log(`目标用户（${targetUsers.length}）：`);
  for (const u of targetUsers) console.log(`  - ${u.name}${u.email ? ` <${u.email}>` : "（无邮箱 ⚠️）"}`);
  console.log("管理者汇总收件人：");
  for (const line of resolvedManagers) console.log(`  - ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
