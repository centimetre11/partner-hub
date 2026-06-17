/** AI model capability tags: for settings UI labels and automatic model selection by scenario */

export const AI_CAPABILITY_META = {
  chat: { label: "General chat", hint: "Daily Q&A and assistant replies" },
  vision: { label: "Vision", hint: "Image understanding, business cards, screenshot OCR" },
  tools: { label: "Tool calling", hint: "Database, web search, KMS, and other Agent capabilities" },
  json: { label: "JSON output", hint: "Profile proposals and structured extraction" },
  reasoning: { label: "Deep reasoning", hint: "Complex analysis and multi-step planning (optional)" },
  fast: { label: "Lightweight & fast", hint: "Preferred for short tasks like attribute extraction and simple JSON" },
} as const;

export type AiCapability = keyof typeof AI_CAPABILITY_META;
export type AiTaskTier = "fast" | "standard";

export const ALL_AI_CAPABILITIES = Object.keys(AI_CAPABILITY_META) as AiCapability[];

/** Default capabilities for new/unlabeled models */
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
