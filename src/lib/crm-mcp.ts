/** CRM MCP — streamable HTTP，鉴权 Authorization: Bearer <token> */
export const CRM_MCP_DEFAULT_URL = "http://118.31.112.98:8061/mcp";
export const CRM_MCP_PROTOCOL_VERSION = "2024-11-05";

export type CrmMcpCredential = {
  token: string;
  mcpUrl: string;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function normalizeToken(raw: string) {
  return raw
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function normalizeMcpUrl(url: string) {
  return (url.trim() || CRM_MCP_DEFAULT_URL).replace(/\/+$/, "");
}

export function normalizeCrmMcpToken(raw: string) {
  return normalizeToken(raw);
}

export async function resolveCrmMcpCredential(): Promise<CrmMcpCredential | null> {
  const token = normalizeToken(process.env.CRM_MCP_TOKEN?.trim() || "");
  if (!token) return null;
  return {
    token,
    mcpUrl: normalizeMcpUrl(process.env.CRM_MCP_URL?.trim() || CRM_MCP_DEFAULT_URL),
  };
}

export async function getCrmMcpConfigStatus() {
  const cred = await resolveCrmMcpCredential();
  return {
    configured: !!cred,
    keyTail: cred ? cred.token.slice(-4) : "",
    mcpUrl: normalizeMcpUrl(process.env.CRM_MCP_URL?.trim() || CRM_MCP_DEFAULT_URL),
    source: cred ? ("env" as const) : null,
  };
}

export async function isCrmMcpConfigured() {
  return !!(await resolveCrmMcpCredential());
}

function parseSseOrJson(text: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("CRM MCP 返回空响应");
  if (trimmed.includes("data: ")) {
    const datas = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));
    if (!datas.length) throw new Error("CRM MCP SSE 无 data 帧");
    return JSON.parse(datas.join("\n")) as JsonRpcResponse;
  }
  return JSON.parse(trimmed) as JsonRpcResponse;
}

function isTransientNetworkError(err: unknown) {
  const msg = err instanceof Error ? `${err.message} ${err.cause ?? ""}` : String(err);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|socket|other side closed/i.test(msg);
}

class CrmMcpSession {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(private cred: CrmMcpCredential) {}

  private async postOnce(body: Record<string, unknown>, opts?: { notify?: boolean }) {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.cred.token}`,
      Connection: "close",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const res = await fetch(this.cred.mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    const text = await res.text();
    if (opts?.notify) {
      if (!res.ok) throw new Error(`CRM MCP notify HTTP ${res.status}`);
      return null;
    }

    let payload: JsonRpcResponse;
    try {
      payload = parseSseOrJson(text);
    } catch {
      throw new Error(`CRM MCP 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new Error(payload.error?.message || `CRM MCP HTTP ${res.status}`);
    }
    if (payload.error) {
      throw new Error(payload.error.message || `CRM MCP 错误 ${payload.error.code ?? ""}`);
    }
    return payload.result;
  }

  private async post(body: Record<string, unknown>, opts?: { notify?: boolean }) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.postOnce(body, opts);
      } catch (err) {
        lastErr = err;
        if (!isTransientNetworkError(err) || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async initialize() {
    await this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: CRM_MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "partner-hub", version: "0.1" },
      },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, { notify: true });
  }

  async callTool(name: string, args: Record<string, unknown> = {}) {
    return this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    });
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseToolContent(result: unknown): { text: string; isError: boolean; structured?: unknown } {
  const root = asRecord(result) ?? {};
  const isError = !!root.isError;
  const content = Array.isArray(root.content) ? root.content : [];
  const texts: string[] = [];
  for (const item of content) {
    const row = asRecord(item);
    if (!row) continue;
    if (row.type === "text" && typeof row.text === "string") texts.push(row.text);
  }
  const text = texts.join("\n").trim();
  let structured: unknown = root.structuredContent ?? root.data;
  if (structured === undefined && text) {
    try {
      structured = JSON.parse(text);
    } catch {
      structured = undefined;
    }
  }
  return { text, isError, structured };
}

/** 单次会话：initialize → tool call(s) → 丢弃 session */
export async function withCrmMcpSession<T>(
  fn: (callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>) => Promise<T>,
  cred?: CrmMcpCredential | null,
): Promise<T> {
  const resolved = cred ?? (await resolveCrmMcpCredential());
  if (!resolved) throw new Error("未配置 CRM MCP 令牌（CRM_MCP_TOKEN）");

  const session = new CrmMcpSession(resolved);
  await session.initialize();

  const callTool = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await session.callTool(name, args);
    const parsed = parseToolContent(result);
    if (parsed.isError) {
      throw new Error(parsed.text || `CRM 工具 ${name} 调用失败`);
    }
    return parsed.structured ?? parsed.text;
  };

  return fn(callTool);
}

export async function callCrmMcpTool(
  toolName: string,
  args: Record<string, unknown> = {},
  cred?: CrmMcpCredential | null,
) {
  return withCrmMcpSession((call) => call(toolName, args), cred);
}

function unwrapCrmPayload(data: unknown): unknown {
  let cur: unknown = data;
  for (let i = 0; i < 3; i++) {
    if (typeof cur === "string") {
      const t = cur.trim();
      if (!t) return cur;
      try {
        cur = JSON.parse(t);
        continue;
      } catch {
        return cur;
      }
    }
    const rec = asRecord(cur);
    // crm_query_view 常把真正载荷放在 result 字符串里（二次 JSON）
    if (rec && typeof rec.result === "string") {
      cur = rec.result;
      continue;
    }
    if (rec && asRecord(rec.result)) {
      cur = rec.result;
      continue;
    }
    break;
  }
  return cur;
}

export function extractCrmRows(data: unknown): Record<string, unknown>[] {
  const unwrapped = unwrapCrmPayload(data);
  if (Array.isArray(unwrapped)) {
    return unwrapped.filter((x): x is Record<string, unknown> => !!asRecord(x));
  }
  const root = asRecord(unwrapped);
  if (!root) return [];

  const candidates = [
    root.rows,
    root.items,
    root.records,
    root.list,
    root.data,
    asRecord(root.data)?.rows,
    asRecord(root.data)?.items,
    asRecord(root.data)?.records,
    asRecord(root.data)?.list,
    asRecord(root.result)?.rows,
    asRecord(root.result)?.items,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      return c.filter((x): x is Record<string, unknown> => !!asRecord(x));
    }
  }
  // 单行 detail
  if (root.com_id || root.opp_id || root.ctr_id || root.key_id || root.prj_number) {
    return [root];
  }
  return [];
}

/**
 * 单次查询封装。业务侧优先用 withCrmMcpSession 在同一会话内完成
 * 「定位客户 → 收口 list/detail」，避免重复 initialize。
 *
 * 约定（对齐 CRM MCP tool_rules）：
 * - filters 显式 {op,value}；include_total 默认 false
 * - list 浏览用 sample；精确主键用 detail + full
 */
export async function crmQueryView(input: {
  viewName: string;
  filters?: Record<string, unknown>;
  limit?: number;
  responseMode?: "sample" | "full";
  includeTotal?: boolean;
  expand?: string[];
}) {
  return withCrmMcpSession(async (call) => {
    const raw = await call("crm_query_view", {
      view_name: input.viewName,
      filters: input.filters ?? {},
      limit: input.limit ?? 20,
      response_mode: input.responseMode ?? "sample",
      include_total: input.includeTotal ?? false,
      ...(input.expand?.length ? { expand: input.expand } : {}),
    });
    return { raw, rows: extractCrmRows(raw) };
  });
}
