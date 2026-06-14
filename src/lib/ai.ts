// 统一的 OpenAI 兼容接口封装：Kimi / DeepSeek / 通义 / OpenAI 均可
import { db } from "./db";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** 火山 Responses API 上一轮 output，多轮 tool calling 时必须原样回放 */
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
  return !!process.env.AI_API_KEY;
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
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

async function resolveAiApi(): Promise<ResolvedAiApi> {
  const configured = await db.aiApiConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (configured) {
    return {
      id: configured.id,
      name: configured.name,
      bucketKey: `api:${configured.id}`,
      provider: configured.provider,
      baseUrl: configured.baseUrl,
      apiKey: configured.apiKey,
      model: configured.model,
      extraConfig: configured.extraConfig,
    };
  }

  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new AIError("AI 尚未配置：请在设置页添加大模型 API，或在 .env 中填写 AI_API_KEY（以及 AI_BASE_URL、AI_MODEL）后重启服务。");
  }
  return {
    id: null,
    name: "环境变量 API",
    bucketKey: `env:${baseUrl}:${model}`,
    provider: "openai",
    baseUrl,
    apiKey,
    model,
    extraConfig: null,
  };
}

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
    console.error("[ai-token-usage] 记录失败:", e);
  }
}

function parseExtraConfig(extraConfig: string | null): Record<string, unknown> {
  if (!extraConfig) return {};
  try {
    return JSON.parse(extraConfig) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 火山 Responses API 使用扁平 function 定义，不接受 OpenAI Chat Completions 的嵌套 function 字段 */
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
  return tools.map(toVolcengineTool);
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
      input.push({
        role: "user",
        content: [{ type: "input_text", text: m.content ?? "" }],
      });
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

function parseVolcengineResponse(data: Record<string, unknown>): {
  content: string | null;
  toolCalls: ToolCall[];
  volcengineReplay: unknown[];
} {
  const output = (data.output ?? []) as Array<Record<string, unknown>>;
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const item of output) {
    if (item.type === "message") {
      const parts = (item.content ?? []) as Array<{ type?: string; text?: string }>;
      for (const part of parts) {
        if (part.text) textParts.push(part.text);
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
    content: textParts.length ? textParts.join("\n") : null,
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
    feature?: string;
    userId?: string;
  }
): Promise<{ content: string | null; toolCalls: ToolCall[]; volcengineReplay?: unknown[] }> {
  const extra = parseExtraConfig(api.extraConfig);
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .join("\n\n");
  const configuredInstructions = typeof extra.instructions === "string" ? extra.instructions : "";
  const instructions = [configuredInstructions, systemText].filter(Boolean).join("\n\n");

  const tools = toVolcengineTools([
    ...((extra.tools as (ToolDef | Record<string, unknown>)[]) ?? []),
    ...(opts.tools ?? []),
  ]);

  const body: Record<string, unknown> = {
    model: api.model,
    stream: false,
    store: extra.store ?? true,
    input: messagesToVolcengineInput(messages),
    ...(instructions ? { instructions } : {}),
    ...(typeof extra.max_output_tokens === "number" ? { max_output_tokens: extra.max_output_tokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(tools.length ? { tools } : {}),
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordBestEffort({ api, feature: opts.feature ?? "未标注 AI 调用", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`火山引擎接口调用失败：${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (process.env.DEBUG_VOLC_REQUEST === "1") {
      console.error("[volcengine] failed request input:", JSON.stringify(body.input).slice(0, 6000));
      console.error("[volcengine] response:", text.slice(0, 2000));
    }
    await recordBestEffort({
      api,
      feature: opts.feature ?? "未标注 AI 调用",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`火山引擎接口调用失败（${res.status}）：${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  if (process.env.DEBUG_VOLC_REQUEST === "1") {
    const output = (data.output ?? []) as Array<Record<string, unknown>>;
    console.error("[volcengine] output types:", output.map((o) => o.type).join(", "));
    console.error("[volcengine] output json:", JSON.stringify(output).slice(0, 4000));
  }
  const usage = readVolcengineTokenUsage(data);
  await recordBestEffort({
    api,
    feature: opts.feature ?? "未标注 AI 调用",
    userId: opts.userId,
    usage,
    status: "SUCCESS",
  });
  return parseVolcengineResponse(data);
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
    feature?: string;
    userId?: string;
    onDelta?: (delta: string) => void;
  }
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model: api.model,
    messages,
    temperature: opts.temperature ?? 0.2,
    stream: true,
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
    await recordBestEffort({ api, feature: opts.feature ?? "未标注 AI 调用", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`AI 接口调用失败：${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await recordBestEffort({
      api,
      feature: opts.feature ?? "未标注 AI 调用",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`AI 接口调用失败（${res.status}）：${text.slice(0, 500)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new AIError("流式响应不可用");

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
    feature: opts.feature ?? "未标注 AI 调用",
    userId: opts.userId,
    status: "SUCCESS",
  });

  const toolCalls = [...toolAcc.values()].filter((t) => t.function.name);
  return { content: content || null, toolCalls };
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: {
    tools?: (ToolDef | Record<string, unknown>)[];
    jsonMode?: boolean;
    temperature?: number;
    feature?: string;
    userId?: string;
    onDelta?: (delta: string) => void;
  } = {}
): Promise<{ content: string | null; toolCalls: ToolCall[]; volcengineReplay?: unknown[] }> {
  const api = await resolveAiApi();

  if (api.provider === "volcengine") {
    const result = await volcengineResponsesCompletion(api, messages, opts);
    if (opts.onDelta && result.content) await simulateTextDeltasAsync(result.content, opts.onDelta);
    return result;
  }

  if (opts.onDelta) {
    return openaiChatCompletionStream(api, messages, opts);
  }

  const body: Record<string, unknown> = {
    model: api.model,
    messages,
    temperature: opts.temperature ?? 0.2,
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
    await recordBestEffort({ api, feature: opts.feature ?? "未标注 AI 调用", userId: opts.userId, status: "FAILED", error: msg });
    throw new AIError(`AI 接口调用失败：${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await recordBestEffort({
      api,
      feature: opts.feature ?? "未标注 AI 调用",
      userId: opts.userId,
      status: "FAILED",
      error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
    });
    throw new AIError(`AI 接口调用失败（${res.status}）：${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const usage = readTokenUsage(data);
  await recordBestEffort({
    api,
    feature: opts.feature ?? "未标注 AI 调用",
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

// 从模型输出中尽力解析 JSON（兼容 ```json 包裹等情况）
export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      return JSON.parse(fenced[1].trim()) as T;
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new AIError("AI 返回内容无法解析为 JSON：" + trimmed.slice(0, 200));
  }
}

export async function chatJson<T>(
  system: string,
  user: string,
  opts: { feature?: string; userId?: string; temperature?: number } = {}
): Promise<T> {
  // 部分兼容接口不支持 response_format，失败时退回普通模式
  try {
    const { content } = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { jsonMode: true, feature: opts.feature, userId: opts.userId, temperature: opts.temperature }
    );
    return parseJsonLoose<T>(content ?? "");
  } catch (e) {
    if (e instanceof AIError && /response_format|json_object|400/.test(e.message)) {
      const { content } = await chatCompletion([
        { role: "system", content: system + "\n\n务必只输出一个合法 JSON 对象，不要输出任何其他文字。" },
        { role: "user", content: user },
      ], { feature: opts.feature, userId: opts.userId, temperature: opts.temperature });
      return parseJsonLoose<T>(content ?? "");
    }
    throw e;
  }
}
