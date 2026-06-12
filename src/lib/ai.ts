// 统一的 OpenAI 兼容接口封装：Kimi / DeepSeek / 通义 / OpenAI 均可
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

export async function chatCompletion(
  messages: ChatMessage[],
  opts: { tools?: ToolDef[]; jsonMode?: boolean; temperature?: number } = {}
): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new AIError("AI 尚未配置：请在 .env 中填写 AI_API_KEY（以及 AI_BASE_URL、AI_MODEL）后重启服务。");
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AIError(`AI 接口调用失败（${res.status}）：${text.slice(0, 500)}`);
  }

  const data = await res.json();
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

export async function chatJson<T>(system: string, user: string): Promise<T> {
  // 部分兼容接口不支持 response_format，失败时退回普通模式
  try {
    const { content } = await chatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { jsonMode: true }
    );
    return parseJsonLoose<T>(content ?? "");
  } catch (e) {
    if (e instanceof AIError && /response_format|json_object|400/.test(e.message)) {
      const { content } = await chatCompletion([
        { role: "system", content: system + "\n\n务必只输出一个合法 JSON 对象，不要输出任何其他文字。" },
        { role: "user", content: user },
      ]);
      return parseJsonLoose<T>(content ?? "");
    }
    throw e;
  }
}
