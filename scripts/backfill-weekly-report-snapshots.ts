/**
 * 将历史上「每周个人工作周报」自动化的 AgentRun 输出回填为 WeeklyReportSnapshot，
 * 便于历史周报页能看到功能上线前的运行记录。
 *
 * 运行：npx tsx scripts/backfill-weekly-report-snapshots.ts
 */
import { db } from "../src/lib/db";
import { WEEKLY_REPORT_SLUG } from "../src/lib/weekly-report-config";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownishToHtml(md: string): string {
  const blocks = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      if (block.startsWith("### ")) {
        return `<h2 style="margin:0 0 12px;font-size:18px">${esc(block.slice(4))}</h2>`;
      }
      if (block.startsWith("## ")) {
        return `<h2 style="margin:0 0 12px;font-size:18px">${esc(block.slice(3))}</h2>`;
      }
      if (block.startsWith("# ")) {
        return `<h1 style="margin:0 0 12px;font-size:20px">${esc(block.slice(2))}</h1>`;
      }
      const lines = block.split("\n");
      if (lines.every((l) => l.startsWith("- ") || l.startsWith("* "))) {
        return `<ul style="margin:8px 0 12px;padding-left:20px">${lines
          .map((l) => `<li style="margin:2px 0">${esc(l.replace(/^[-*]\s+/, "").replace(/\*\*/g, ""))}</li>`)
          .join("")}</ul>`;
      }
      return `<p style="margin:8px 0;line-height:1.7">${esc(block).replace(/\n/g, "<br/>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>`;
    })
    .join("");
}

function parseWeekLabel(output: string | null): string {
  const m = output?.match(/团队周报（([^）]+)）/);
  return m?.[1]?.trim() || "unknown";
}

function parseWindow(label: string, fallbackEnd: Date): { start: Date; end: Date } {
  const parts = label.split(/\s*~\s*/).map((s) => s.trim());
  if (parts.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]) && /^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
    return {
      start: new Date(`${parts[0]}T00:00:00.000Z`),
      end: new Date(`${parts[1]}T23:59:59.000Z`),
    };
  }
  return { start: fallbackEnd, end: fallbackEnd };
}

async function main() {
  const agent = await db.agent.findFirst({ where: { slug: WEEKLY_REPORT_SLUG }, select: { id: true } });
  if (!agent) {
    console.log("未找到周报自动化");
    return;
  }

  const runs = await db.agentRun.findMany({
    where: { agentId: agent.id, status: { in: ["SUCCESS", "PARTIAL_SUCCESS"] }, output: { not: null } },
    orderBy: { startedAt: "asc" },
    select: { id: true, output: true, startedAt: true, finishedAt: true },
  });

  let created = 0;
  let skipped = 0;
  for (const run of runs) {
    const existing = await db.weeklyReportSnapshot.count({ where: { agentRunId: run.id } });
    if (existing > 0) {
      skipped++;
      continue;
    }
    const weekLabel = parseWeekLabel(run.output);
    const end = run.finishedAt ?? run.startedAt;
    const { start, end: windowEnd } = parseWindow(weekLabel, end);
    const subject = `📈 团队周报汇总（${weekLabel}）· 历史回填`;
    const body = (run.output ?? "").trim() || "（无输出）";
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1f2937">
  <p style="color:#6b7280;font-size:12px;margin:0 0 12px">本条由历史运行记录回填；完整个人邮件快照从功能上线后的运行开始保存。</p>
  ${markdownishToHtml(body)}
</div>`;

    await db.weeklyReportSnapshot.create({
      data: {
        kind: "MANAGER_DIGEST",
        weekLabel,
        windowStart: start,
        windowEnd: windowEnd,
        locale: "zh",
        subject,
        html,
        text: body,
        source: "SCHEDULED",
        agentRunId: run.id,
        createdAt: end,
      },
    });
    created++;
    console.log(`+ ${run.id} → ${weekLabel}`);
  }

  console.log(`\n完成：新建 ${created}，已有快照跳过 ${skipped}，共扫描 ${runs.length} 次运行`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
