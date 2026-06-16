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
    { title: `判定 ${partnerName} 的伙伴类型（数据原生/竞品迁移/泛集成）`, days: 5 },
    { title: `完善 ${partnerName} 的权力地图（决策者/教练/商务）`, days: 7 },
    { title: `确定 ${partnerName} 的联合价值模式与价值三行`, days: 10 },
    { title: `安排 ${partnerName} 技术 Demo（按价值模式，含 Arabic RTL）`, days: 14 },
  ];
  for (const t of starterTodos) {
    const due = new Date();
    due.setDate(due.getDate() + t.days);
    await db.todoItem.create({
      data: { title: t.title, partnerId, assigneeId, dueDate: due, priority: "HIGH", source: "SEED" },
    });
  }
}
