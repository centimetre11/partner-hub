/**
 * 将《中东运营模式与细分客群洞察》基线报告写入报告中心（Document）。
 * 按固定标题 upsert，可重复执行以同步 docs 源文件内容。
 *
 * 运行：npx tsx scripts/seed-mea-strategy-report.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "../src/lib/db";
import { MEA_STRATEGY_REPORT_TITLE } from "../src/lib/mea-strategy-report";

async function main() {
  const mdPath = join(process.cwd(), "docs/reports/mea-icp-strategy-baseline-2026-07.md");
  const content = readFileSync(mdPath, "utf8");

  const existing = await db.document.findFirst({
    where: { title: MEA_STRATEGY_REPORT_TITLE },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    await db.document.update({
      where: { id: existing.id },
      data: {
        content,
        type: "STRATEGY",
        status: "FINAL",
      },
    });
    console.log(`Updated report: ${existing.id} — ${MEA_STRATEGY_REPORT_TITLE}`);
  } else {
    const created = await db.document.create({
      data: {
        title: MEA_STRATEGY_REPORT_TITLE,
        type: "STRATEGY",
        status: "FINAL",
        content,
      },
    });
    console.log(`Created report: ${created.id} — ${MEA_STRATEGY_REPORT_TITLE}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
