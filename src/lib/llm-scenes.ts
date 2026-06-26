/**
 * LLM 场景（scene）：把模型按顺序分配给不同业务场景，替代「按能力自动路由」。
 * 选中场景时按分配顺序依次尝试，额度用尽自动切下一个；
 * 全部用尽后回退到「默认」场景，再回退到全部启用模型（兜底）。
 */

import { db } from "./db";

export const LLM_SCENES = ["lead_research", "fast", "profiling", "vision", "default"] as const;
export type LlmScene = (typeof LLM_SCENES)[number];

export function isLlmScene(value: string): value is LlmScene {
  return (LLM_SCENES as readonly string[]).includes(value);
}

/** 场景元信息（用于设置页展示；文案以 i18n 为准，这里只作兜底） */
export const LLM_SCENE_META: Record<LlmScene, { label: string; hint: string }> = {
  lead_research: {
    label: "线索研究",
    hint: "联网搜索 + 结果整理。会自动用带联网搜索的模型搜索，再用便宜模型整理。",
  },
  fast: {
    label: "快速交互",
    hint: "查待办、记商务记录、商机、联系人等轻量解析。",
  },
  profiling: {
    label: "建档",
    hint: "新伙伴 / 新客户 / 档案补全等高智力任务。",
  },
  vision: {
    label: "图片识别",
    hint: "名片、截图 OCR 等，需要支持视觉的模型。",
  },
  default: {
    label: "全局默认 / 兜底",
    hint: "未单独配置的场景，以及某场景模型全部用尽时，都会走这里。",
  },
};

export type SceneAssignments = Map<LlmScene, string[]>;

/** 读取全部场景分配：scene -> 有序 apiConfigId[] */
export async function getSceneAssignments(): Promise<SceneAssignments> {
  const rows = await db.llmSceneModel.findMany({
    orderBy: [{ scene: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: { scene: true, apiConfigId: true },
  });
  const map: SceneAssignments = new Map();
  for (const row of rows) {
    if (!isLlmScene(row.scene)) continue;
    const list = map.get(row.scene) ?? [];
    list.push(row.apiConfigId);
    map.set(row.scene, list);
  }
  return map;
}

/** 是否已配置任何场景分配（决定是否启用「场景调度」还是回退「能力调度」） */
export async function hasAnySceneAssignment(): Promise<boolean> {
  return (await db.llmSceneModel.count()) > 0;
}

/**
 * 给定场景，返回按优先级排好序的 apiConfigId 列表：
 * 1. 该场景已分配的模型（按 order）
 * 2. 「默认」场景已分配的模型（按 order）
 * 重复项已去重。返回的顺序即尝试顺序（额度过滤由调用方处理）。
 */
export function orderedSceneApiIds(assignments: SceneAssignments, scene: LlmScene): string[] {
  const out: string[] = [];
  const push = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const id of assignments.get(scene) ?? []) push(id);
  if (scene !== "default") {
    for (const id of assignments.get("default") ?? []) push(id);
  }
  return out;
}
