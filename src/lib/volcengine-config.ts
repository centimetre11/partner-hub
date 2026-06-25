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
  throw new Error("JSON request body not found. Paste the full curl or JSON");
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
  if (!bearer) return undefined;
  return normalizeApiKeyInput(bearer[1]) ?? undefined;
}

/** 是否为占位符（非真实 Key） */
export function isPlaceholderApiKey(key: string): boolean {
  const trimmed = key.trim().replace(/^Bearer\s+/i, "");
  if (!trimmed) return true;
  if (/^\$[A-Z_][A-Z0-9_]*$/i.test(trimmed)) return true;
  if (/你的|xxx|example|placeholder|changeme/i.test(trimmed)) return true;
  return false;
}

/** 规范化用户输入或数据库中的 Key（仅过滤占位符，不做长度限制） */
export function normalizeApiKeyInput(key: string): string | null {
  const trimmed = key.trim().replace(/^Bearer\s+/i, "");
  if (isPlaceholderApiKey(trimmed)) return null;
  return trimmed;
}

/** @deprecated 使用 normalizeApiKeyInput */
export function sanitizeVolcengineApiKey(key: string): string | null {
  return normalizeApiKeyInput(key);
}

export function sanitizeVolcengineModel(model: string): string | null {
  const trimmed = model.trim();
  if (!/^ep-[a-z0-9-]+$/i.test(trimmed)) return null;
  if (/你的|xxx|example/i.test(trimmed)) return null;
  return trimmed;
}

export function buildVolcengineSnippetFromConfig(
  model: string,
  extra: VolcengineExtraConfig | null,
  baseUrl = DEFAULT_BASE_URL
): string {
  const body: Record<string, unknown> = {
    model,
    ...(extra ?? {}),
    input: [{ role: "user", content: [{ type: "input_text", text: "Sample question" }] }],
  };
  return `curl --location '${baseUrl.replace(/\/+$/, "")}/responses' \\
--header "Authorization: Bearer $ARK_API_KEY" \\
--header 'Content-Type: application/json' \\
--data '${JSON.stringify(body, null, 2)}'`;
}

export function parseVolcengineSnippet(raw: string): { ok: true; data: VolcengineParsedConfig } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Paste the curl command or JSON request body" };

  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = JSON.parse(extractJsonBlock(text)) as Record<string, unknown>;
    }

    const modelRaw = String(body.model ?? "").trim();
    const model = sanitizeVolcengineModel(modelRaw);
    if (!model) return { ok: false, error: "Request body is missing a valid model (should be an ep- inference endpoint ID)" };

    const url = extractUrl(text);
    const baseUrl = normalizeBaseUrl(url ?? DEFAULT_BASE_URL);

    const extraConfig: VolcengineExtraConfig = {};
    for (const [key, value] of Object.entries(body)) {
      if (EXTRA_KEYS.has(key)) extraConfig[key] = value;
    }
    if (extraConfig.store === undefined) extraConfig.store = true;

    const apiKeyFromSnippet = extractBearerKey(text);

    return {
      ok: true,
      data: {
        baseUrl,
        model,
        apiKey: apiKeyFromSnippet,
        extraConfig,
        sampleInput: body.input,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Parse failed; check the format" };
  }
}

export function summarizeVolcengineExtra(extra: VolcengineExtraConfig): string[] {
  const lines: string[] = [];
  const webSearch = (extra.tools ?? []).find((t) => t.type === "web_search");
  if (webSearch) {
    const maxKeyword = webSearch.max_keyword ?? "default";
    const limit = webSearch.limit ?? "default";
    const sources = Array.isArray(webSearch.sources) ? webSearch.sources.join(", ") : "default";
    lines.push(`Web search: max_keyword=${maxKeyword}, limit=${limit}, sources=${sources}`);
  } else if (extra.tools?.length) {
    lines.push(`Tools: ${extra.tools.map((t) => String(t.type ?? "unknown")).join(", ")}`);
  }
  if (extra.instructions) lines.push(`System instructions: ${String(extra.instructions).slice(0, 60)}…`);
  if (extra.stream) lines.push("Streaming: enabled (in-app calls default to non-streaming)");
  if (extra.max_output_tokens) lines.push(`Max output tokens: ${extra.max_output_tokens}`);
  return lines;
}

export const VOLCENGINE_SNIPPET_PLACEHOLDER = `curl --location 'https://ark.cn-beijing.volces.com/api/v3/responses' \\
--header "Authorization: Bearer $ARK_API_KEY" \\
--header 'Content-Type: application/json' \\
--data '{
  "model": "ep-your-endpoint-id",
  "stream": true,
  "tools": [{ "type": "web_search", "max_keyword": 3 }],
  "input": [{ "role": "user", "content": [{ "type": "input_text", "text": "What are today's trending news?" }] }]
}'`;

/** Preset curl for lead research synthesis (lightweight endpoint, no web_search — search uses another Volcengine entry) */
export function buildLeadResearchVolcengineSnippet(model = "ep-your-light-endpoint-id"): string {
  return buildVolcengineSnippetFromConfig(model, {
    max_output_tokens: 1200,
    stream: false,
  });
}
