/** AI model capability tags: internal routing + optional manual presets (vision is auto-detected only). */

export const AI_CAPABILITY_META = {
  chat: { label: "General chat", hint: "Daily Q&A and assistant replies" },
  tools: { label: "Tool calling", hint: "Database, web search, KMS, and other Agent capabilities" },
  json: { label: "JSON output", hint: "Profile proposals and structured extraction" },
  reasoning: { label: "Deep reasoning", hint: "Complex analysis and multi-step planning (optional)" },
  fast: { label: "Lightweight & fast", hint: "Preferred for short tasks like attribute extraction and simple JSON" },
  lead_research: {
    label: "Lead research",
    hint: "Lightweight model for lead web research synthesis (JSON from search snippets)",
  },
} as const;

/** Stored / manually preset tags (vision is never stored — see model-capability-detect) */
export type StoredAiCapability = keyof typeof AI_CAPABILITY_META;

/** Runtime routing may also require auto-detected vision */
export type AiCapability = StoredAiCapability | "vision";

export type AiTaskTier = "fast" | "standard";

/** Default max completion tokens for fast intake (AI Add, WeCom propose, business records). */
export const DEFAULT_FAST_INTAKE_MAX_TOKENS = 800;

export function resolveFastIntakeMaxTokens(): number {
  const raw = process.env.FAST_INTAKE_MAX_TOKENS?.trim();
  if (!raw) return DEFAULT_FAST_INTAKE_MAX_TOKENS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 128) return DEFAULT_FAST_INTAKE_MAX_TOKENS;
  return Math.min(Math.floor(n), 4096);
}

export function maxTokensForTaskTier(tier?: AiTaskTier): number | undefined {
  return tier === "fast" ? resolveFastIntakeMaxTokens() : undefined;
}

export const ALL_STORED_AI_CAPABILITIES = Object.keys(AI_CAPABILITY_META) as StoredAiCapability[];

/** Default capabilities for new/unlabeled models */
export const DEFAULT_AI_CAPABILITIES: StoredAiCapability[] = ["chat", "tools", "json"];

/** Recommended tags for lead research synthesis (cheap model; search uses Kimi/Volcengine separately) */
export const LEAD_RESEARCH_PRESET_CAPABILITIES: StoredAiCapability[] = ["lead_research", "fast", "json"];

export function parseAiCapabilities(raw: string | null | undefined): StoredAiCapability[] {
  if (!raw?.trim()) return [...DEFAULT_AI_CAPABILITIES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_AI_CAPABILITIES];
    const valid = new Set(ALL_STORED_AI_CAPABILITIES);
    const caps = parsed.filter(
      (c): c is StoredAiCapability => typeof c === "string" && valid.has(c as StoredAiCapability),
    );
    return caps.length ? caps : [...DEFAULT_AI_CAPABILITIES];
  } catch {
    return [...DEFAULT_AI_CAPABILITIES];
  }
}

export function serializeAiCapabilities(caps: StoredAiCapability[]): string {
  const valid = new Set(ALL_STORED_AI_CAPABILITIES);
  const unique = [...new Set(caps.filter((c) => valid.has(c)))];
  return JSON.stringify(unique.length ? unique : DEFAULT_AI_CAPABILITIES);
}

export function capabilityLabel(cap: StoredAiCapability): string {
  return AI_CAPABILITY_META[cap].label;
}

export function apiHasCapabilities(apiCaps: AiCapability[], required: AiCapability[]): boolean {
  const set = new Set(apiCaps);
  return required.every((r) => set.has(r));
}
