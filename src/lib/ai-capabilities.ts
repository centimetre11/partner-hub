/** AI 模型能力标签：用于在设置页标注、并按场景自动选模型 */

export const AI_CAPABILITY_META = {
  chat: { label: "通用对话", hint: "日常问答、助手回复" },
  vision: { label: "图片理解", hint: "识图、名片、截图 OCR" },
  tools: { label: "工具调用", hint: "查库、联网、KMS 等 Agent 能力" },
  json: { label: "JSON 输出", hint: "建档提案、结构化抽取" },
  reasoning: { label: "深度推理", hint: "复杂分析、多步规划（可选）" },
  fast: { label: "轻量快速", hint: "属性抽取、简单 JSON 等短任务优先选用" },
} as const;

export type AiCapability = keyof typeof AI_CAPABILITY_META;
export type AiTaskTier = "fast" | "standard";

export const ALL_AI_CAPABILITIES = Object.keys(AI_CAPABILITY_META) as AiCapability[];

/** 新建/未标注模型时的默认能力 */
export const DEFAULT_AI_CAPABILITIES: AiCapability[] = ["chat", "tools", "json"];

export function parseAiCapabilities(raw: string | null | undefined): AiCapability[] {
  if (!raw?.trim()) return [...DEFAULT_AI_CAPABILITIES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_AI_CAPABILITIES];
    const valid = new Set(ALL_AI_CAPABILITIES);
    const caps = parsed.filter((c): c is AiCapability => typeof c === "string" && valid.has(c as AiCapability));
    return caps.length ? caps : [...DEFAULT_AI_CAPABILITIES];
  } catch {
    return [...DEFAULT_AI_CAPABILITIES];
  }
}

export function serializeAiCapabilities(caps: AiCapability[]): string {
  const valid = new Set(ALL_AI_CAPABILITIES);
  const unique = [...new Set(caps.filter((c) => valid.has(c)))];
  return JSON.stringify(unique.length ? unique : DEFAULT_AI_CAPABILITIES);
}

export function capabilityLabel(cap: AiCapability): string {
  return AI_CAPABILITY_META[cap].label;
}

export function apiHasCapabilities(apiCaps: AiCapability[], required: AiCapability[]): boolean {
  const set = new Set(apiCaps);
  return required.every((r) => set.has(r));
}

export function parseCapabilitiesFromForm(formData: FormData): AiCapability[] {
  const caps = formData
    .getAll("capabilities")
    .map((v) => String(v).trim())
    .filter((v): v is AiCapability => ALL_AI_CAPABILITIES.includes(v as AiCapability));
  return caps.length ? caps : [...DEFAULT_AI_CAPABILITIES];
}
