export type VolcengineExtraConfig = {
  tools?: Record<string, unknown>[];
  stream?: boolean;
  store?: boolean;
  instructions?: string;
  max_output_tokens?: number;
  [key: string]: unknown;
};

export type VolcengineParsedConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  extraConfig: VolcengineExtraConfig;
  sampleInput?: unknown;
};

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

const EXTRA_KEYS = new Set([
  "tools",
  "stream",
  "store",
  "instructions",
  "max_output_tokens",
  "temperature",
  "top_p",
  "tool_choice",
  "previous_response_id",
]);

function extractJsonBlock(raw: string): string {
  const dataFlag = raw.match(/(?:--data|-d)\s+'([\s\S]*?)'\s*(?:\\|$)/);
  if (dataFlag) return dataFlag[1];
  const dataFlagDouble = raw.match(/(?:--data|-d)\s+"([\s\S]*?)"\s*(?:\\|$)/);
  if (dataFlagDouble) return dataFlagDouble[1];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  throw new Error("未找到 JSON 请求体，请粘贴完整 curl 或 JSON");
}

function extractUrl(raw: string): string | undefined {
  const curlUrl = raw.match(/curl[^\n]*?'(https?:\/\/[^']+)'/);
  if (curlUrl) return curlUrl[1];
  const plainUrl = raw.match(/(https?:\/\/[^\s'"]+)/);
  return plainUrl?.[1];
}

function normalizeBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.replace(/\/responses$/i, "");
}

function extractBearerKey(raw: string): string | undefined {
  const bearer = raw.match(/Authorization:\s*Bearer\s+([^\s'"\\]+)/i);
  if (bearer) return bearer[1];
  const envRef = raw.match(/\$([A-Z_][A-Z0-9_]*)/);
  if (envRef && envRef[1] !== "ARK_API_KEY") return undefined;
  return undefined;
}

export function parseVolcengineSnippet(raw: string): { ok: true; data: VolcengineParsedConfig } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "请粘贴 curl 命令或 JSON 请求体" };

  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = JSON.parse(extractJsonBlock(text)) as Record<string, unknown>;
    }

    const model = String(body.model ?? "").trim();
    if (!model) return { ok: false, error: "请求体中缺少 model（推理接入点 ep-xxx）" };

    const url = extractUrl(text);
    const baseUrl = normalizeBaseUrl(url ?? DEFAULT_BASE_URL);

    const extraConfig: VolcengineExtraConfig = {};
    for (const [key, value] of Object.entries(body)) {
      if (EXTRA_KEYS.has(key)) extraConfig[key] = value;
    }
    if (extraConfig.store === undefined) extraConfig.store = true;

    const apiKeyFromSnippet = extractBearerKey(text);
    const apiKey =
      apiKeyFromSnippet && !apiKeyFromSnippet.startsWith("$") ? apiKeyFromSnippet : undefined;

    return {
      ok: true,
      data: {
        baseUrl,
        model,
        apiKey,
        extraConfig,
        sampleInput: body.input,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "解析失败，请检查格式" };
  }
}

export function summarizeVolcengineExtra(extra: VolcengineExtraConfig): string[] {
  const lines: string[] = [];
  const webSearch = (extra.tools ?? []).find((t) => t.type === "web_search");
  if (webSearch) {
    const maxKeyword = webSearch.max_keyword ?? "默认";
    const limit = webSearch.limit ?? "默认";
    const sources = Array.isArray(webSearch.sources) ? webSearch.sources.join(", ") : "默认";
    lines.push(`联网搜索：max_keyword=${maxKeyword}，limit=${limit}，sources=${sources}`);
  } else if (extra.tools?.length) {
    lines.push(`工具：${extra.tools.map((t) => String(t.type ?? "unknown")).join(", ")}`);
  }
  if (extra.instructions) lines.push(`系统指令：${String(extra.instructions).slice(0, 60)}…`);
  if (extra.stream) lines.push("流式输出：开启（系统内调用默认非流式）");
  if (extra.max_output_tokens) lines.push(`最大输出 Token：${extra.max_output_tokens}`);
  return lines;
}

export const VOLCENGINE_SNIPPET_PLACEHOLDER = `curl --location 'https://ark.cn-beijing.volces.com/api/v3/responses' \\
--header "Authorization: Bearer $ARK_API_KEY" \\
--header 'Content-Type: application/json' \\
--data '{
  "model": "ep-你的接入点ID",
  "stream": true,
  "tools": [{ "type": "web_search", "max_keyword": 3 }],
  "input": [{ "role": "user", "content": [{ "type": "input_text", "text": "今天有什么热点新闻" }] }]
}'`;
