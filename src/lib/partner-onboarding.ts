import { db } from "./db";

/** 新建/转正为正式伙伴时的默认字段（与「转正」逻辑保持一致） */
export const ACTIVE_PARTNER_DEFAULTS = {
  status: "ACTIVE",
  poolFlag: "ADVANCING",
  pipelineStage: 2,
} as const;

/** 转正/直建正式伙伴后自动生成的起步待办 */
export async function createStarterTodos(partnerId: string, partnerName: string, assigneeId: string) {
  const starterTodos = [
    { title: `Determine partner type for ${partnerName} (data-native / competitor migration / general integration)`, days: 5 },
    { title: `Complete power map for ${partnerName} (decision-maker / coach / business)`, days: 7 },
    { title: `Define joint value model and value trio for ${partnerName}`, days: 10 },
    { title: `Schedule technical demo for ${partnerName} (per value model, incl. Arabic RTL)`, days: 14 },
  ];
  for (const t of starterTodos) {
    const due = new Date();
    due.setDate(due.getDate() + t.days);
    await db.todoItem.create({
      data: { title: t.title, partnerId, assigneeId, dueDate: due, priority: "HIGH", source: "SEED" },
    });
  }
}
