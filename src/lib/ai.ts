// Unified OpenAI-compatible API wrapper: Kimi / DeepSeek / Tongyi / OpenAI, etc.
import { db } from "./db";
import {
  type AiCapability,
  type AiTaskTier,
  apiHasCapabilities,
  DEFAULT_AI_CAPABILITIES,
  maxTokensForTaskTier,
  parseAiCapabilities,
  resolveFastIntakeMaxTokens,
} from "./ai-capabilities";
import { normalizeMessagesForAi } from "./ai-images-server";
import {
  getSceneAssignments,
  orderedSceneApiIds,
  type LlmScene,
} from "./llm-scenes";
import { apiMeetsRequiredCapabilities, detectVisionFromText } from "./model-capability-detect";

export type ChatImage = { url: string; name?: string };

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  images?: ChatImage[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Volcengine Responses API prior output; must be replayed verbatim for multi-turn tool calling */
  volcengineReplay?: unknown[];
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export function aiConfigured() {
  return !!process.env.AI_API_KEY?.trim();
}

/** 是否已配置 AI：优先检查「团队设置 → 大模型管理中心」的数据库 API，再回退 .env */
export async function isAiConfigured(): Promise<boolean> {
  const enabled = await db.aiApiConfig.count({ where: { enabled: true } });
  return enabled > 0 || aiConfigured();
}

export type AiConfigSummary = {
  configured: boolean;
  source: "database" | "env" | "none";
  preferredLabel: string | null;
  apis: Array<{
    id: string;
    name: string;
    model: string;
    provider: string;
    isDefault: boolean;
    priority: number;
    capabilities: AiCapability[];
  }>;
};

/** 汇总当前可用的 AI 配置（Web 助手、企微机器人、Agent 等共用同一套调度逻辑） */
export async function getAiConfigSummary(): Promise<AiConfigSummary> {
  const rows = await db.aiApiConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });

  if (rows.length) {
    const apis = rows.map((row) => ({
      id: row.id,
      name: row.name,
      model: row.model,
      provider: row.provider,
      isDefault: row.isDefault,
      priority: row.priority,
      capabilities: parseAiCapabilities(row.capabilities),
    }));
    const preferred = rows.find((r) => r.isDefault) ?? rows[0];
    return {
      configured: true,
      source: "database",
      preferredLabel: `${preferred.name} · ${preferred.model}`,
      apis,
    };
  }

  if (aiConfigured()) {
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    return {
      configured: true,
      source: "env",
      preferredLabel: `.env · ${model}`,
      apis: [],
    };
  }

  return { configured: false, source: "none", preferredLabel: null, apis: [] };
}

export class AIError extends Error {}

type ResolvedAiApi = {
  id: string | null;
  name: string;
  bucketKey: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraConfig: string | null;
  capabilities: AiCapability[];
};

function toResolvedApi(row: {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraConfig: string | null;
  capabilities?: string | null;
}): ResolvedAiApi {
  return {
    id: row.id,
    name: row.name,
    bucketKey: `api:${row.id}`,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: row.model,
    extraConfig: row.extraConfig,
    capabilities: parseAiCapabilities(row.capabilities),
  };
}

export function messageHasImages(messages: ChatMessage[]): boolean {
  return messages.some((m) => (m.images?.length ?? 0) > 0);
}

export function requiredCapabilitiesForChat(opts: {
  messages: ChatMessage[];
  tools?: (ToolDef | Record<string, unknown>)[];
  jsonMode?: boolean;
  capability?: AiCapability;
}): AiCapability[] {
  if (opts.capability) return [opts.capability];
  const required: AiCapability[] = ["chat"];
  if (opts.tools?.length) required.push("tools");
  if (opts.jsonMode) required.push("json");
  if (messageHasImages(opts.messages)) required.push("vision");
  return required;
}

type ConfiguredApiRow = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraConfig: string | null;
  capabilities: string | null;
  dailyTokenLimit: number | null;
};

/**
 * 场景调度：按「场景模型分配」依次返回候选模型。
 * 顺序 = 该场景分配 → 默认场景分配 → 全部启用模型（兜底）；
 * 每组内额度未用尽的排前面，用尽的排最后作最终兜底。
 * 若尚未配置任何场景分配，返回空数组，由调用方回退到能力调度。
 */
async function buildSceneCandidates(
  configured: ConfiguredApiRow[],
  scene: LlmScene,
  apiConfigId?: string,
): Promise<ResolvedAiApi[]> {
  const assignments = await getSceneAssignments();
  if (!assignments.size) return [];
  const preferred = orderedSceneApiIds(assignments, scene);
  if (!preferred.length) return [];

  const byId = new Map(configured.map((a) => [a.id, a]));
  // 显式部分：管理员在该场景（含默认）里指定的模型，严格按其顺序
  const explicitIds: string[] = [];
  const pushExplicit = (id: string) => {
    if (byId.has(id) && !explicitIds.includes(id)) explicitIds.push(id);
  };
  if (apiConfigId) pushExplicit(apiConfigId);
  for (const id of preferred) pushExplicit(id);

  // vision 场景：优先视觉模型，避免场景分配里第一个是纯文本模型
  if (scene === "vision" && explicitIds.length > 1) {
    const visionIds = explicitIds.filter((id) => {
      const a = byId.get(id);
      return a && detectVisionFromText(a.name, a.model, a.extraConfig);
    });
    const otherIds = explicitIds.filter((id) => !visionIds.includes(id));
    explicitIds.length = 0;
    explicitIds.push(...visionIds, ...otherIds);
  }

  // 兜底部分：其余全部启用模型
  let fallbackRows = configured.filter((a) => !explicitIds.includes(a.id));
  if (scene === "vision") {
    // 兜底里优先选疑似支持视觉的模型，避免选到纯文本模型导致失败
    const visionRank = (a: ConfiguredApiRow) =>
      detectVisionFromText(a.name, a.model, a.extraConfig) ? 0 : 1;
    fallbackRows = [...fallbackRows].sort((a, b) => visionRank(a) - visionRank(b));
  }

  const orderedIds = [...explicitIds, ...fallbackRows.map((a) => a.id)];

  const day = new Date().toISOString().slice(0, 10);
  const usages = await db.aiDailyTokenUsage.findMany({
    where: { day, bucketKey: { in: configured.map((a) => `api:${a.id}`) } },
  });
  const usedByBucket = new Map(usages.map((u) => [u.bucketKey, u.totalTokens]));
  const isOver = (a: ConfiguredApiRow) => {
    const limit = a.dailyTokenLimit ?? 0;
    if (limit <= 0) return false;
    return (usedByBucket.get(`api:${a.id}`) ?? 0) >= limit;
  };

  const rows = orderedIds.map((id) => byId.get(id)!);
  const under = rows.filter((a) => !isOver(a));
  const over = rows.filter((a) => isOver(a));
  return [...under, ...over].map(toResolvedApi);
}

async function listAiApiCandidates(opts?: {
  capabilities?: AiCapability[];
  taskTier?: AiTaskTier;
  /** Prefer this API first (e.g. web-search entry); on failure callers try the rest */
  apiConfigId?: string;
  /** 业务场景：优先按「场景模型分配」调度，未配置则回退能力调度 */
  scene?: LlmScene;
}): Promise<ResolvedAiApi[]> {
  const required = opts?.capabilities ?? ["chat"];
  const configured = await db.aiApiConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
  });

  const candidates: ResolvedAiApi[] = [];
  const seen = new Set<string>();
  const add = (api: ResolvedAiApi) => {
    const key = api.id ?? api.bucketKey;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(api);
  };

  if (configured.length) {
    type ConfiguredApi = (typeof configured)[number];

    if (opts?.scene) {
      const sceneCandidates = await buildSceneCandidates(configured, opts.scene, opts.apiConfigId);
      if (sceneCandidates.length) return sceneCandidates;
    }

    if (opts?.apiConfigId) {
      const forced = configured.find((a) => a.id === opts.apiConfigId);
      if (forced) add(toResolvedApi(forced));
    }

    const day = new Date().toISOString().slice(0, 10);
    const usages = await db.aiDailyTokenUsage.findMany({
      where: { day, bucketKey: { in: configured.map((api) => `api:${api.id}`) } },
    });
    const usedByBucket = new Map(usages.map((u) => [u.bucketKey, u.totalTokens]));

    const isOverDailyLimit = (api: ConfiguredApi) => {
      const limit = api.dailyTokenLimit ?? 0;
      if (limit <= 0) return false;
      return (usedByBucket.get(`api:${api.id}`) ?? 0) >= limit;
    };
    const matchesCap = (api: ConfiguredApi) => apiMeetsRequiredCapabilities(api, required);

    const available = configured.filter((api) => !isOverDailyLimit(api));

    const pickBest = (pool: ConfiguredApi[]): ConfiguredApi | undefined => {
      if (!pool.length) return undefined;
      if (opts?.taskTier === "fast") {
        const fastTagged = pool.filter((api) => parseAiCapabilities(api.capabilities).includes("fast"));
        const fastMatch = fastTagged.find(matchesCap);
        if (fastMatch) return fastMatch;
        const nonReasoning = pool.filter((api) => !parseAiCapabilities(api.capabilities).includes("reasoning"));
        const lightMatch = nonReasoning.find(matchesCap);
        if (lightMatch) return lightMatch;
      }
      return pool.find(matchesCap);
    };

    const addConfigured = (api: ConfiguredApi) => add(toResolvedApi(api));
    const isFastApi = (api: ConfiguredApi) => parseAiCapabilities(api.capabilities).includes("fast");
    const matchingAvailable = available.filter(matchesCap);

    const matched = pickBest(available);
    if (matched) {
      const naturalChoice = configured.find(matchesCap);
      if (naturalChoice && naturalChoice.id !== matched.id && !opts?.apiConfigId) {
        const reason =
          opts?.taskTier === "fast" && matched.id !== naturalChoice.id
            ? "light task prefers fast model"
            : `daily token limit reached (${usedByBucket.get(`api:${naturalChoice.id}`) ?? 0}/${naturalChoice.dailyTokenLimit})`;
        console.warn(`[ai] ${naturalChoice.name} ${reason}, auto-switching to ${matched.name}`);
      }
    }

    if (opts?.taskTier === "fast") {
      // Fast tier: exhaust all fast-tagged models before falling back to standard ones
      for (const api of matchingAvailable.filter(isFastApi)) addConfigured(api);
      for (const api of matchingAvailable.filter((api) => !isFastApi(api))) addConfigured(api);
    } else {
      if (matched) addConfigured(matched);
      for (const api of matchingAvailable) addConfigured(api);
    }

    for (const api of available) addConfigured(api);
    for (const api of configured) {
      if (isOverDailyLimit(api) && matchesCap(api)) addConfigured(api);
    }
    for (const api of configured) addConfigured(api);

    if (candidates.length) return candidates;
  }

  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new AIError(
      "AI is not configured: add a model API in Settings, or set AI_API_KEY (and AI_BASE_URL, AI_MODEL) in .env and restart."
    );
  }
  return [
    {
      id: null,
      name: "Environment variable API",
      bucketKey: `env:${baseUrl}:${model}`,
      provider: "openai",
      baseUrl,
      apiKey,
      model,
      extraConfig: null,
      capabilities: [...DEFAULT_AI_CAPABILITIES, "vision"],
    },
  ];
}

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function readTokenUsage(data: Record<string, unknown>): TokenUsage {
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

async function recordAiTokenUsage(opts: {
  api: ResolvedAiApi;
  feature: string;
  userId?: string;
  usage?: TokenUsage;
  status: "SUCCESS" | "FAILED";
  error?: string;
}) {
  const usage = opts.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const now = new Date();
  await db.aiTokenUsage.create({
    data: {
      apiConfigId: opts.api.id,
      bucketKey: opts.api.bucketKey,
      apiName: opts.api.name,
      feature: opts.feature,
      model: opts.api.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      status: opts.status,
      error: opts.error?.slice(0, 1000),
      userId: opts.userId,
      createdAt: now,
    },
  });
  if (opts.status !== "SUCCESS") return;
  await db.aiDailyTokenUsage.upsert({
    where: { bucketKey_day: { bucketKey: opts.api.bucketKey, day: now.toISOString().slice(0, 10) } },
    create: {
      apiConfigId: opts.api.id,
      bucketKey: opts.api.bucketKey,
      apiName: opts.api.name,
      day: now.toISOString().slice(0, 10),
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      requestCount: 1,
    },
    update: {
      apiName: opts.api.name,
      promptTokens: { increment: usage.promptTokens },
      completionTokens: { increment: usage.completionTokens },
      totalTokens: { increment: usage.totalTokens },
      requestCount: { increment: 1 },
    },
  });
}

async function recordBestEffort(opts: Parameters<typeof recordAiTokenUsage>[0]) {
  try {
    await recordAiTokenUsage(opts);
  } catch (e) {
    console.error("[ai-token-usage] record failed:", e);
  }
}

/** Volcengine API request timeout (vision+JSON usually <60s; fail fast instead of hanging) */
const VOLCENGINE_FETCH_MS = 120_000;

function parseExtraConfig(extraConfig: string | null): Record<string, unknown> {
  if (!extraConfig) return {};
  try {
    return JSON.parse(extraConfig) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Volcengine Responses API uses flat function defs, not OpenAI Chat Completions nested function field */
function toVolcengineTool(tool: ToolDef | Record<string, unknown>): Record<string, unknown> {
  if (typeof tool !== "object" || tool === null) return tool as Record<string, unknown>;
  const t = tool as Record<string, unknown>;
  if (t.type === "function" && t.function && typeof t.function === "object") {
    const fn = t.function as Record<string, unknown>;
    const flat: Record<string, unknown> = {
      type: "function",
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters ?? { type: "object", properties: {} },
    };
    if (fn.strict !== undefined) flat.strict = fn.strict;
    return flat;
  }
  return t;
}

function toVolcengineTools(tools: (ToolDef | Record<string, unknown>)[]): Record<string, unknown>[] {
  const mapped = tools.map(toVolcengineTool);
  // 去重：内置工具（如 web_search）按 type 去重，函数工具按 name 去重，避免 extraConfig 与运行时注入重复。
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const t of mapped) {
    const type = typeof t.type === "string" ? t.type : "";
    const key = type === "function" ? `function:${String(t.name ?? "")}` : `type:${type}`;
    if (key !== "type:" && seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: m.role, content: m.content ?? "", tool_call_id: m.tool_call_id };
    }
    if (m.role === "assistant") {
      return {
        role: m.role,
        content: m.content ?? "",
        ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
      };
    }
    if (m.role === "user" && m.images?.length) {
      const parts: unknown[] = [];
      if (m.content?.trim()) parts.push({ type: "text", text: m.content });
      for (const img of m.images) {
        parts.push({ type: "image_url", image_url: { url: img.url } });
      }
      return { role: "user", content: parts };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

function prepareVolcengineReplay(output: Array<Record<string, unknown>>): unknown[] {
  const statusTypes = new Set(["reasoning", "message", "function_call", "function_call_output", "web_search_call"]);
  return output.map((item) => {
    const replay: Record<string, unknown> = { ...item };
    if (statusTypes.has(String(item.type)) && !replay.status) replay.status = "completed";
    return replay;
  });
}

function messagesToVolcengineInput(messages: ChatMessage[]): unknown[] {
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      const parts: unknown[] = [];
      if (m.content?.trim()) parts.push({ type: "input_text", text: m.content });
      for (const img of m.images ?? []) {
        parts.push({ type: "input_image", image_url: img.url });
      }
      if (!parts.length) parts.push({ type: "input_text", text: "" });
      input.push({ role: "user", content: parts });
      continue;
    }
    if (m.role === "assistant") {
      if (m.volcengineReplay?.length) {
        input.push(...m.volcengineReplay);
        continue;
      }
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            status: "completed",
          });
        }
      }
      if (m.content) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: m.content }],
          status: "completed",
        });
      }
      continue;
    }
    if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: m.content ?? "",
        status: "completed",
      });
    }
  }
  return input;
}

function extractVolcengineTextPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const p = part as Record<string, unknown>;
  if (typeof p.text === "string") return p.text;
  if (typeof p.output_text === "string") return p.output_text;
  if (typeof p.content === "string") return p.content;
  return "";
}

function parseVolcengineResponse(data: Record<string, unknown>): {
  content: string | null;
  toolCalls: ToolCall[];
  volcengineReplay: unknown[];
} {
  const output = (data.output ?? []) as Array<Record<string, unknown>>;
  const textParts: string[] = [];
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    textParts.push(data.output_text.trim());
  }
  const toolCalls: ToolCall[] = [];
  for (const item of output) {
    if (item.type === "output_text") {
      const t = extractVolcengineTextPart(item);
      if (t) textParts.push(t);
      continue;
    }
    if (item.type === "message") {
      const content = item.content;
      if (typeof content === "string" && content.trim()) {
        textParts.push(content.trim());
        continue;
      }
      const parts = Array.isArray(content) ? content : [];
      for (const part of parts) {
        const t = extractVolcengineTextPart(part);
        if (t) textParts.push(t);
      }
      continue;
    }
    if (item.type === "function_call") {
      toolCalls.push({
        id: String(item.call_id ?? item.id ?? `call_${toolCalls.length}`),
        type: "function",
        function: {
          name: String(item.name ?? ""),
          arguments:
            typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    }
  }
  return {
    content: textParts.length ? textParts.join("\n").trim() : null,
    toolCalls,
    volcengineReplay: prepareVolcengineReplay(output),
  };
}

function readVolcengineTokenUsage(data: Record<string, unknown>): TokenUsage {
  const usage = (data.usage ?? {}) as Record<string, unknown>;
  const promptTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

async function volcengineResponsesCompletion(
  api: ResolvedAiApi,
  messages: ChatMessage[],
  opts: {
    tools?: (ToolDef | Record<string, unknown>)[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    feature?: string;
    userId?: string;
    toolChoice?: "auto" | "required" | "none";
  }
): Promise<{ content: string | null; toolCalls: ToolCall[]; volcengineReplay?: unknown[] }> {
  const extra = parseExtraConfig(api.extraConfig);
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .join("\n\n");
  const configuredInstructions = typeof extra.instructions === "string" ? extra.instructions : "";
  const instructions = [configuredInstructions, systemText].filter(Boolean).join("\n\n");

  const hasImages = messageHasImages(messages);
  // 识图 + JSON 结构化提取时禁用 extra 工具（如 web_search），避免模型只回 tool_call 无正文
  const includeExtraTools = !(opts.jsonMode && hasImages);
  const tools = toVolcengineTools([
    ...(includeExtraTools ? ((extra.tools as (ToolDef | Record<string, unknown>)[]) ?? []) : []),
    ...(opts.tools ?? []),
  ]);

  const maxOutputTokens = resolveMaxOutputTokens(extra, opts.maxTokens);

  const body: Record<string, unknown> = {
    model: api.model,
    stream: false,
    store: extra.store ?? true,
    input: messagesToVolcengineInput(messages),
    ...(instructions ? { instructions } : {}),
    ...(typeof maxOutputTokens === "number" ? { max_output_tokens: maxOutputTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(tools.length ? { tools } : {}),
    ...(opts.toolChoice
      ? { tool_choice: opts.toolChoice }
      : opts.jsonMode && hasImages
        ? { tool_choice: "none" }
        : {}),
  };
  if (opts.jsonMode) {
    body.text = { format: { type: "json_object" } };
  }

  let res: Response;
  try {
    res = await fetch(`${api.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VOLCENGINE_FETCH_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordBestEffort({ api, feature: opts.feature ?? "Unlabeled AI call", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`Volcengine API call failed: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (process.env.DEBUG_VOLC_REQUEST === "1") {
      console.error("[volcengine] failed request input:", JSON.stringify(body.input).slice(0, 6000));
      console.error("[volcengine] response:", text.slice(0, 2000));
    }
    await recordBestEffort({
      api,
      feature: opts.feature ?? "Unlabeled AI call",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`Volcengine API call failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const rawBody = await res.text().catch(() => "");
  let data: Record<string, unknown>;
  try {
    data = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    await recordBestEffort({
      api,
      feature: opts.feature ?? "Unlabeled AI call",
      userId: opts.userId,
      status: "FAILED",
      error: `Non-JSON response: ${rawBody.slice(0, 300)}`,
    });
    throw new AIError(
      `Volcengine returned non-JSON response: ${rawBody.replace(/\s+/g, " ").slice(0, 200)}`
    );
  }
  if (process.env.DEBUG_VOLC_REQUEST === "1") {
    const output = (data.output ?? []) as Array<Record<string, unknown>>;
    console.error("[volcengine] output types:", output.map((o) => o.type).join(", "));
    console.error("[volcengine] output json:", JSON.stringify(output).slice(0, 4000));
  }
  const usage = readVolcengineTokenUsage(data);
  await recordBestEffort({
    api,
    feature: opts.feature ?? "Unlabeled AI call",
    userId: opts.userId,
    usage,
    status: "SUCCESS",
  });
  return parseVolcengineResponse(data);
}

/** Volcengine Responses API true streaming: push text deltas via onDelta; parse authoritative result from response.completed output */
async function volcengineResponsesStream(
  api: ResolvedAiApi,
  messages: ChatMessage[],
  opts: {
    tools?: (ToolDef | Record<string, unknown>)[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    feature?: string;
    userId?: string;
    onDelta?: (delta: string) => void;
    toolChoice?: "auto" | "required" | "none";
  }
): Promise<{ content: string | null; toolCalls: ToolCall[]; volcengineReplay?: unknown[] }> {
  const extra = parseExtraConfig(api.extraConfig);
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .join("\n\n");
  const configuredInstructions = typeof extra.instructions === "string" ? extra.instructions : "";
  const instructions = [configuredInstructions, systemText].filter(Boolean).join("\n\n");

  const hasImages = messageHasImages(messages);
  const includeExtraTools = !(opts.jsonMode && hasImages);
  const tools = toVolcengineTools([
    ...(includeExtraTools ? ((extra.tools as (ToolDef | Record<string, unknown>)[]) ?? []) : []),
    ...(opts.tools ?? []),
  ]);

  const maxOutputTokens = resolveMaxOutputTokens(extra, opts.maxTokens);

  const body: Record<string, unknown> = {
    model: api.model,
    stream: true,
    store: extra.store ?? true,
    input: messagesToVolcengineInput(messages),
    ...(instructions ? { instructions } : {}),
    ...(typeof maxOutputTokens === "number" ? { max_output_tokens: maxOutputTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(tools.length ? { tools } : {}),
    ...(opts.toolChoice
      ? { tool_choice: opts.toolChoice }
      : opts.jsonMode && hasImages
        ? { tool_choice: "none" }
        : {}),
  };
  if (opts.jsonMode) {
    body.text = { format: { type: "json_object" } };
  }

  let res: Response;
  try {
    res = await fetch(`${api.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VOLCENGINE_FETCH_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordBestEffort({ api, feature: opts.feature ?? "Unlabeled AI call", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`Volcengine API call failed: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await recordBestEffort({
      api,
      feature: opts.feature ?? "Unlabeled AI call",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`Volcengine API call failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new AIError("Streaming response unavailable");

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: Record<string, unknown> | null = null;
  let fallbackText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = String(parsed.type ?? "");
      // Text delta: true streaming character-by-character push
      if (type === "response.output_text.delta") {
        const delta = parsed.delta;
        if (typeof delta === "string" && delta) {
          fallbackText += delta;
          opts.onDelta?.(delta);
        }
      } else if (type === "response.completed" || type === "response.incomplete") {
        const r = parsed.response;
        if (r && typeof r === "object") finalResponse = r as Record<string, unknown>;
      } else if (type === "error" || type === "response.failed") {
        const errMsg = (parsed.message as string) ?? JSON.stringify(parsed);
        await recordBestEffort({ api, feature: opts.feature ?? "Unlabeled AI call", userId: opts.userId, status: "FAILED", error: errMsg.slice(0, 500) });
        throw new AIError(`Volcengine streaming error: ${errMsg.slice(0, 500)}`);
      }
    }
  }

  if (finalResponse) {
    const usage = readVolcengineTokenUsage(finalResponse);
    await recordBestEffort({
      api,
      feature: opts.feature ?? "Unlabeled AI call",
      userId: opts.userId,
      usage,
      status: "SUCCESS",
    });
    return parseVolcengineResponse(finalResponse);
  }

  // No response.completed: fall back to accumulated text
  await recordBestEffort({ api, feature: opts.feature ?? "Unlabeled AI call", userId: opts.userId, status: "SUCCESS" });
  return { content: fallbackText || null, toolCalls: [], volcengineReplay: [] };
}

function simulateTextDeltas(text: string | null, onDelta?: (delta: string) => void) {
  if (!text || !onDelta) return;
  const size = 8;
  for (let i = 0; i < text.length; i += size) {
    onDelta(text.slice(i, i + size));
  }
}

async function simulateTextDeltasAsync(text: string | null, onDelta?: (delta: string) => void, delayMs = 20) {
  if (!text || !onDelta) return;
  const size = 8;
  for (let i = 0; i < text.length; i += size) {
    onDelta(text.slice(i, i + size));
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}

async function openaiChatCompletionStream(
  api: ResolvedAiApi,
  messages: ChatMessage[],
  opts: {
    tools?: (ToolDef | Record<string, unknown>)[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    feature?: string;
    userId?: string;
    onDelta?: (delta: string) => void;
  }
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model: api.model,
    messages: toOpenAiMessages(messages),
    temperature: opts.temperature ?? 0.2,
    stream: true,
    ...(typeof opts.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
  };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${api.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordBestEffort({ api, feature: opts.feature ?? "Unlabeled AI call", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`AI API call failed: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await recordBestEffort({
      api,
      feature: opts.feature ?? "Unlabeled AI call",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`AI API call failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new AIError("Streaming response unavailable");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolAcc = new Map<number, ToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const choice = (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0];
        const delta = choice?.delta as Record<string, unknown> | undefined;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          opts.onDelta?.(delta.content);
        }
        const tcs = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (tcs) {
          for (const tc of tcs) {
            const idx = Number(tc.index ?? 0);
            if (!toolAcc.has(idx)) {
              toolAcc.set(idx, {
                id: "",
                type: "function",
                function: { name: "", arguments: "" },
              });
            }
            const acc = toolAcc.get(idx)!;
            if (tc.id) acc.id = String(tc.id);
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn?.name) acc.function.name += String(fn.name);
            if (fn?.arguments) acc.function.arguments += String(fn.arguments);
          }
        }
      } catch {
        /* skip malformed chunk */
      }
    }
  }

  await recordBestEffort({
    api,
    feature: opts.feature ?? "Unlabeled AI call",
    userId: opts.userId,
    status: "SUCCESS",
  });

  const toolCalls = [...toolAcc.values()].filter((t) => t.function.name);
  return { content: content || null, toolCalls };
}

type ChatCompletionOpts = {
  tools?: (ToolDef | Record<string, unknown>)[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  feature?: string;
  userId?: string;
  onDelta?: (delta: string) => void;
  toolChoice?: "auto" | "required" | "none";
};

function resolveMaxOutputTokens(extra: Record<string, unknown>, maxTokens?: number): number | undefined {
  if (typeof extra.max_output_tokens === "number") return extra.max_output_tokens;
  return maxTokens;
}

async function chatCompletionWithApi(
  api: ResolvedAiApi,
  messages: ChatMessage[],
  opts: ChatCompletionOpts
): Promise<{ content: string | null; toolCalls: ToolCall[]; volcengineReplay?: unknown[] }> {
  if (api.provider === "volcengine") {
    if (opts.onDelta) return volcengineResponsesStream(api, messages, opts);
    return volcengineResponsesCompletion(api, messages, opts);
  }

  if (opts.onDelta) return openaiChatCompletionStream(api, messages, opts);

  const body: Record<string, unknown> = {
    model: api.model,
    messages: toOpenAiMessages(messages),
    temperature: opts.temperature ?? 0.2,
    ...(typeof opts.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
  };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${api.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordBestEffort({ api, feature: opts.feature ?? "Unlabeled AI call", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`AI API call failed: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await recordBestEffort({
      api,
      feature: opts.feature ?? "Unlabeled AI call",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`AI API call failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const usage = readTokenUsage(data);
  await recordBestEffort({
    api,
    feature: opts.feature ?? "Unlabeled AI call",
    userId: opts.userId,
    usage,
    status: "SUCCESS",
  });
  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content ?? null,
    toolCalls: (msg?.tool_calls as ToolCall[]) ?? [],
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: {
    tools?: (ToolDef | Record<string, unknown>)[];
    jsonMode?: boolean;
    temperature?: number;
    maxTokens?: number;
    feature?: string;
    userId?: string;
    onDelta?: (delta: string) => void;
    /** Force model selection by capability (e.g. vision) */
    capability?: AiCapability;
    /** fast: light tasks like attribute extraction; prefer models tagged fast or without deep reasoning */
    taskTier?: AiTaskTier;
    /** Prefer this API first (e.g. web search via Doubao/Kimi entry) */
    apiConfigId?: string;
    /** When false, do not try other APIs after the primary candidate fails (default true) */
    apiFallback?: boolean;
    toolChoice?: "auto" | "required" | "none";
    /** 业务场景：优先按「场景模型分配」调度；不传则按「默认」场景兜底 */
    scene?: LlmScene;
  } = {}
): Promise<{ content: string | null; toolCalls: ToolCall[]; volcengineReplay?: unknown[] }> {
  messages = normalizeMessagesForAi(messages);
  const maxTokens = opts.maxTokens ?? maxTokensForTaskTier(opts.taskTier);
  // 图片输入强制走「图片识别」场景，确保选到视觉模型
  const effectiveScene: LlmScene = messageHasImages(messages) ? "vision" : opts.scene ?? "default";
  const candidates = await listAiApiCandidates({
    capabilities: requiredCapabilitiesForChat({
      messages,
      tools: opts.tools,
      jsonMode: opts.jsonMode,
      capability: opts.capability,
    }),
    taskTier: opts.taskTier,
    apiConfigId: opts.apiConfigId,
    scene: effectiveScene,
  });

  const tryList = opts.apiFallback === false ? candidates.slice(0, 1) : candidates;

  const callOpts: ChatCompletionOpts = {
    tools: opts.tools,
    jsonMode: opts.jsonMode,
    temperature: opts.temperature,
    maxTokens,
    feature: opts.feature,
    userId: opts.userId,
    onDelta: opts.onDelta,
    toolChoice: opts.toolChoice,
  };

  const errors: string[] = [];
  for (let i = 0; i < tryList.length; i++) {
    const api = tryList[i]!;
    try {
      const result = await chatCompletionWithApi(api, messages, callOpts);
      const text = (result.content ?? "").trim();
      if (!text && i < tryList.length - 1) {
        errors.push(`${api.name}: empty response`);
        console.warn(`[ai] ${api.name} returned empty content, trying next API…`);
        continue;
      }
      if (i > 0) {
        console.warn(`[ai] Switched to ${api.name} after ${i} failed attempt(s): ${errors[errors.length - 1]?.slice(0, 120)}`);
      }
      return result;
    } catch (e) {
      const msg = e instanceof AIError ? e.message : e instanceof Error ? e.message : String(e);
      errors.push(`${api.name}: ${msg}`);
      if (i < tryList.length - 1) {
        console.warn(`[ai] ${api.name} failed (${msg.slice(0, 120)}), trying next API…`);
      }
    }
  }

  if (errors.length === 1) throw new AIError(errors[0]!);
  throw new AIError(`All ${errors.length} AI API(s) failed:\n${errors.map((e) => `- ${e}`).join("\n")}`);
}

// Best-effort parse JSON from model output (handles ```json fences, trailing commas, etc.)
function repairJsonText(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, "");
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/^\s*\/\/.*$/gm, "");
  return s;
}

function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) {
      out.add(t);
      out.add(repairJsonText(t));
    }
  };
  add(trimmed);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) add(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) add(trimmed.slice(start, end + 1));
  return [...out];
}

function closeOpenBrackets(s: string): string {
  let out = s.replace(/,\s*$/, "");
  let braces = 0;
  let brackets = 0;
  for (const ch of out) {
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  while (brackets > 0) {
    out += "]";
    brackets--;
  }
  while (braces > 0) {
    out += "}";
    braces--;
  }
  return out;
}

/** Salvage JSON truncated by max_tokens — drop the last incomplete field and close brackets */
function salvageTruncatedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let s = text.slice(start).trim();
  for (let i = 0; i < 10; i++) {
    for (const candidate of [s, repairJsonText(s), closeOpenBrackets(s), closeOpenBrackets(repairJsonText(s))]) {
      if (tryParseJson(candidate)) return candidate;
    }
    const comma = s.lastIndexOf(",");
    if (comma <= 0) break;
    s = s.slice(0, comma);
  }
  return null;
}

/** Returns null instead of throwing when all repair attempts fail */
export function safeParseJsonLoose<T>(text: string): T | null {
  for (const candidate of jsonCandidates(text)) {
    const parsed = tryParseJson<T>(candidate);
    if (parsed !== null) return parsed;
  }
  const salvaged = salvageTruncatedJson(text);
  if (salvaged) {
    const parsed = tryParseJson<T>(salvaged);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseJsonLoose<T>(text: string): T {
  const parsed = safeParseJsonLoose<T>(text);
  if (parsed !== null) return parsed;
  const preview = text.trim().slice(0, 200);
  throw new AIError(`AI response could not be parsed as JSON: ${preview}`);
}

async function chatJsonOnce(
  system: string,
  user: string,
  opts: {
    feature?: string;
    userId?: string;
    temperature?: number;
    taskTier?: import("./ai-capabilities").AiTaskTier;
    capability?: AiCapability;
    maxTokens?: number;
    onDelta?: (delta: string) => void;
    jsonMode?: boolean;
    scene?: LlmScene;
  }
): Promise<string> {
  const { content } = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      jsonMode: opts.jsonMode !== false,
      feature: opts.feature,
      userId: opts.userId,
      temperature: opts.temperature,
      taskTier: opts.taskTier,
      capability: opts.capability,
      maxTokens: opts.maxTokens,
      onDelta: opts.onDelta,
      scene: opts.scene,
    }
  );
  return content ?? "";
}

export async function chatJson<T>(
  system: string,
  user: string,
  opts: {
    feature?: string;
    userId?: string;
    temperature?: number;
    taskTier?: import("./ai-capabilities").AiTaskTier;
    capability?: AiCapability;
    maxTokens?: number;
    scene?: LlmScene;
  } = {}
): Promise<T> {
  try {
    return parseJsonLoose<T>(await chatJsonOnce(system, user, opts));
  } catch (e) {
    if (e instanceof AIError && /response_format|json_object|400/.test(e.message)) {
      const content = await chatJsonOnce(
        system + "\n\nOutput exactly one valid JSON object only. Do not output any other text.",
        user,
        { ...opts, jsonMode: false }
      );
      return parseJsonLoose<T>(content);
    }
    throw e;
  }
}

/** chatJson with internal streaming for parse fallback; UI gets clean reply via emitReplyChunks after parse. */
export async function chatJsonStream<T>(
  system: string,
  user: string,
  opts: {
    feature?: string;
    userId?: string;
    temperature?: number;
    taskTier?: import("./ai-capabilities").AiTaskTier;
    maxTokens?: number;
    emit?: import("./ai-trace").TraceEmitter;
    scene?: LlmScene;
  } = {}
): Promise<{ data: T }> {
  let streamed = "";
  const onDelta = (d: string) => {
    streamed += d;
  };

  const mergedText = () => (streamed.trim());

  const parseMerged = (content: string) =>
    parseJsonLoose<T>((content ?? "").trim() || mergedText());

  const run = async (maxTokens: number, jsonMode = true) => {
    streamed = "";
    return chatJsonOnce(system, user, { ...opts, onDelta, maxTokens, jsonMode });
  };

  const baseMax = opts.maxTokens ?? resolveFastIntakeMaxTokens();
  const retryMax = Math.max(baseMax * 2, 640);

  try {
    const content = await run(baseMax);
    return { data: parseMerged(content) };
  } catch (e) {
    const parseFail = e instanceof AIError && /could not be parsed as JSON/i.test(e.message);
    if (parseFail && retryMax > baseMax) {
      try {
        const content = await run(retryMax);
        return { data: parseMerged(content) };
      } catch {
        /* fall through */
      }
    }
    if (e instanceof AIError && /response_format|json_object|400/.test(e.message)) {
      const content = await run(retryMax, false);
      return { data: parseMerged(content) };
    }
    throw e;
  }
}
