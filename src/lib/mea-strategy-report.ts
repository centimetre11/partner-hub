/** 中东 ICP 策略基线报告 — 报告中心固定标题，供 seed 与 UI 链接共用 */
export const MEA_STRATEGY_REPORT_TITLE = "[基线] 中东运营模式与细分客群洞察（2026-07）";

export async function findMeaStrategyBaselineReport(db: {
  document: {
    findFirst: (args: {
      where: { title: string };
      orderBy: { updatedAt: "desc" };
      select: { id: true; title: true; updatedAt: true };
    }) => Promise<{ id: string; title: string; updatedAt: Date } | null>;
  };
}) {
  return db.document.findFirst({
    where: { title: MEA_STRATEGY_REPORT_TITLE },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}
