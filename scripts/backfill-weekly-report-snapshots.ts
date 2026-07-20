/**
 * 为历史上「每周个人工作周报」的每次成功运行，补档个人周报 + 完整管理者汇总（不发邮件）。
 *
 * 运行（容器内，需绕过 server-only）：
 *   cp node_modules/server-only/index.js /tmp/server-only.bak.js
 *   printf 'module.exports = {};\n' > node_modules/server-only/index.js
 *   SKIP_LLM=1 npx tsx scripts/backfill-weekly-report-snapshots.ts
 *   mv /tmp/server-only.bak.js node_modules/server-only/index.js
 *
 * 可选：SKIP_LLM=1 用确定性兜底叙述（更快，不调 AI）
 */
import { db } from "../src/lib/db";
import { WEEKLY_REPORT_SLUG } from "../src/lib/weekly-report-config";
import { archiveWeeklyReportsOnly } from "../src/lib/weekly-report";

async function main() {
  const agent = await db.agent.findFirst({ where: { slug: WEEKLY_REPORT_SLUG } });
  if (!agent) {
    console.log("未找到周报自动化");
    return;
  }

  const skipLlm = process.env.SKIP_LLM === "1" || process.env.SKIP_LLM === "true";
  const runs = await db.agentRun.findMany({
    where: { agentId: agent.id, status: { in: ["SUCCESS", "PARTIAL_SUCCESS"] } },
    orderBy: { startedAt: "asc" },
    select: { id: true, startedAt: true, finishedAt: true },
  });

  console.log(`扫描 ${runs.length} 次运行（skipLlm=${skipLlm}）…`);

  for (const run of runs) {
    const windowEnd = run.finishedAt ?? run.startedAt;
    const res = await archiveWeeklyReportsOnly(agent, {
      windowEnd,
      agentRunId: run.id,
      source: "SCHEDULED",
      createdAt: windowEnd,
      skipLlm,
      skipIfPersonalExists: true,
    });
    if (res.skipped) {
      console.log(`· ${run.id} 已有个人快照，跳过`);
      continue;
    }
    console.log(`+ ${run.id} → ${res.weekLabel}（个人 ${res.personal} + 汇总 ${res.digest}）`);
  }

  const totals = await db.weeklyReportSnapshot.groupBy({
    by: ["kind"],
    _count: { _all: true },
  });
  console.log("\n当前快照统计：");
  for (const t of totals) console.log(`  ${t.kind}: ${t._count._all}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
