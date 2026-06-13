// 统一的 OpenAI 兼容接口封装：Kimi / DeepSeek / 通义 / OpenAI 均可
import { db } from "./db";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
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
  baseUrl: string;
  apiKey: string;
  model: string;
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
      baseUrl: configured.baseUrl,
      apiKey: configured.apiKey,
      model: configured.model,
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
    baseUrl,
    apiKey,
    model,
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

export async function chatCompletion(
  messages: ChatMessage[],
  opts: {
    tools?: (ToolDef | Record<string, unknown>)[];
    jsonMode?: boolean;
    temperature?: number;
    feature?: string;
    userId?: string;
  } = {}
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const api = await resolveAiApi();

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
