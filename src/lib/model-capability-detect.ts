/**
 * 模型能力检测：不再由人工勾选，而是根据「配置本身」推断模型在某场景下能否胜任。
 * - web_search：火山 Ark 内置 web_search 工具，任意 Ark 模型注入即可联网；或 Kimi(moonshot) 内置 $web_search。
 * - vision：按模型名启发式判断（多模态模型名通常含 vl / vision / 4o / seed / omni 等）。
 */

import type { LlmScene } from "./llm-scenes";

export type DetectedCapabilities = {
  /** 是否具备联网搜索（来自配置，可靠） */
  webSearch: boolean;
  /** 是否疑似支持图片/视觉（按模型名启发式，仅供参考） */
  vision: boolean;
};

export type ModelForDetect = {
  provider: string;
  baseUrl: string;
  model: string;
  extraConfig: string | null;
};

function isKimiBaseUrl(baseUrl: string | null | undefined): boolean {
  return (baseUrl ?? "").toLowerCase().includes("moonshot");
}

export function detectWebSearch(api: ModelForDetect): boolean {
  // 火山 Ark 的 web_search 是平台内置工具，任意 Ark 模型在请求里注入即可联网，无需在 extraConfig 里预配。
  if (api.provider === "volcengine") return true;
  return isKimiBaseUrl(api.baseUrl);
}

/** 多模态/视觉模型名常见关键字（小写匹配） */
const VISION_NAME_HINTS = [
  "vision",
  "-vl",
  "vl-",
  "-vl-",
  "qwen-vl",
  "qwen2-vl",
  "qwen2.5-vl",
  "internvl",
  "glm-4v",
  "glm-4.1v",
  "glm-4.5v",
  "step-1v",
  "step-1o",
  "yi-vision",
  "pixtral",
  "llava",
  "gpt-4o",
  "gpt-4.1",
  "gpt-5",
  "o4",
  "omni",
  "gemini",
  "claude-3",
  "claude-4",
  "claude-opus",
  "claude-sonnet",
  "doubao-seed",
  "doubao-1.5-vision",
  "doubao-vision",
  "seed-1.6",
  "seed-1-6",
  "ui-tars",
];

export function detectVision(model: string): boolean {
  const name = (model ?? "").toLowerCase();
  if (!name) return false;
  return VISION_NAME_HINTS.some((h) => name.includes(h));
}

export function detectModelCapabilities(api: ModelForDetect): DetectedCapabilities {
  return { webSearch: detectWebSearch(api), vision: detectVision(api.model) };
}

/** 某场景所需的「特殊能力」；null 表示任意 chat/json 模型都能胜任 */
export type SceneRequirement = "web_search" | "vision" | null;

export function sceneRequirement(scene: LlmScene): SceneRequirement {
  if (scene === "lead_research") return "web_search"; // 整个场景至少要有 1 个联网搜索模型（搜索步骤用）
  if (scene === "vision") return "vision"; // 每个模型都应支持视觉
  return null;
}

/** 单个模型是否满足某能力需求 */
export function modelMeetsRequirement(caps: DetectedCapabilities, req: SceneRequirement): boolean {
  if (req === "web_search") return caps.webSearch;
  if (req === "vision") return caps.vision;
  return true;
}
