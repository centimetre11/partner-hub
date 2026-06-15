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
    { title: `完善 ${partnerName} 的权力地图（决策者/把关人/商务）`, days: 7 },
    { title: `确认 ${partnerName} 的联合解决方案与切入点`, days: 10 },
    { title: `安排 ${partnerName} 技术 Demo（含 Arabic RTL）`, days: 14 },
  ];
  for (const t of starterTodos) {
    const due = new Date();
    due.setDate(due.getDate() + t.days);
    await db.todoItem.create({
      data: { title: t.title, partnerId, assigneeId, dueDate: due, priority: "HIGH", source: "SEED" },
    });
  }
}
