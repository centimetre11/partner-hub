/**
 * 模型能力检测：根据配置自动推断，无需人工勾选 Vision 等标签。
 * - web_search：火山 Ark 内置 web_search 工具，任意 Ark 模型注入即可联网；或 Kimi(moonshot) 内置 $web_search。
 * - vision：按配置名 + 模型 ID + extraConfig 启发式判断（火山 Ark 常用 ep- 接入点，真实型号在 name 里）。
 */

import type { AiCapability, StoredAiCapability } from "./ai-capabilities";
import { apiHasCapabilities, parseAiCapabilities } from "./ai-capabilities";
import type { LlmScene } from "./llm-scenes";

export type DetectedCapabilities = {
  /** 是否具备联网搜索（来自配置，可靠） */
  webSearch: boolean;
  /** 是否疑似支持图片/视觉（按配置名/模型名启发式） */
  vision: boolean;
};

export type ModelForDetect = {
  name?: string | null;
  provider: string;
  baseUrl: string;
  model: string;
  extraConfig: string | null;
  capabilities?: string | null;
};

function isKimiBaseUrl(baseUrl: string | null | undefined): boolean {
  return (baseUrl ?? "").toLowerCase().includes("moonshot");
}

export function detectWebSearch(api: ModelForDetect): boolean {
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
  "qwen3-vl",
  "internvl",
  "glm-4v",
  "glm-4.1v",
  "glm-4.5v",
  "glm-4.7",
  "glm-4.",
  "glm4",
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
  "seed-2",
  "seed2",
  "ui-tars",
  "deepseek-v3",
  "deepseekv3",
  "kimi-k2",
];

/** 合并配置名、模型 ID、extraConfig 后再做视觉启发式匹配 */
export function detectVisionFromText(...parts: (string | null | undefined)[]): boolean {
  const combined = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!combined) return false;
  return VISION_NAME_HINTS.some((h) => combined.includes(h));
}

/** @deprecated 请用 detectVisionFromText */
export function detectVision(model: string): boolean {
  return detectVisionFromText(model);
}

/** 路由用有效能力 = 存储标签 + 自动识别的 vision */
export function effectiveCapabilities(api: ModelForDetect): AiCapability[] {
  const stored = parseAiCapabilities(api.capabilities) as StoredAiCapability[];
  const caps: AiCapability[] = [...stored];
  if (detectVisionFromText(api.name, api.model, api.extraConfig) && !caps.includes("vision")) {
    caps.push("vision");
  }
  return caps;
}

export function detectModelCapabilities(api: ModelForDetect): DetectedCapabilities {
  return {
    webSearch: detectWebSearch(api),
    vision: detectVisionFromText(api.name, api.model, api.extraConfig),
  };
}

/** 模型是否满足路由所需能力（vision 仅自动识别，不读人工标签） */
export function apiMeetsRequiredCapabilities(api: ModelForDetect, required: AiCapability[]): boolean {
  return apiHasCapabilities(effectiveCapabilities(api), required);
}

/** 某场景所需的「特殊能力」；null 表示任意 chat/json 模型都能胜任 */
export type SceneRequirement = "web_search" | "vision" | null;

export function sceneRequirement(scene: LlmScene): SceneRequirement {
  if (scene === "lead_research") return "web_search";
  if (scene === "vision") return "vision";
  return null;
}

/** 单个模型是否满足某能力需求 */
export function modelMeetsRequirement(caps: DetectedCapabilities, req: SceneRequirement): boolean {
  if (req === "web_search") return caps.webSearch;
  if (req === "vision") return caps.vision;
  return true;
}
