/** Moss MCP — 正式工程地址，鉴权仅用 Authorization: Bearer <token> */
export const MOSS_DEFAULT_MCP_URL = "https://dev.mossdo.com/api/v1/mcp";
export const MOSS_PROTOCOL_VERSION = "2025-03-26";

export type MossCredential = {
  token: string;
  mcpUrl: string;
};

export type MossTool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
};

export type MossCompanyHit = {
  name: string;
  creditCode?: string;
  companyId?: string;
  legalPerson?: string;
  status?: string;
  registeredCapital?: string;
  establishDate?: string;
  address?: string;
  raw: Record<string, unknown>;
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
  return (url.trim() || MOSS_DEFAULT_MCP_URL).replace(/\/+$/, "");
}

export function normalizeMossToken(raw: string) {
  return normalizeToken(raw);
}

export async function resolveMossCredential(): Promise<MossCredential | null> {
  const token = normalizeToken(process.env.MOSS_MCP_TOKEN?.trim() || "");
  if (!token) return null;
  return {
    token,
    mcpUrl: normalizeMcpUrl(process.env.MOSS_MCP_URL?.trim() || MOSS_DEFAULT_MCP_URL),
  };
}

export async function getMossConfigStatus() {
  const cred = await resolveMossCredential();
  return {
    configured: !!cred,
    keyTail: cred ? cred.token.slice(-4) : "",
    mcpUrl: normalizeMcpUrl(process.env.MOSS_MCP_URL?.trim() || MOSS_DEFAULT_MCP_URL),
    source: cred ? ("env" as const) : null,
  };
}

export async function isMossConfigured() {
  return !!(await resolveMossCredential());
}

async function mossRpc<T>(
  cred: MossCredential,
  method: string,
  params?: Record<string, unknown>,
  id: number | string = 1,
): Promise<T> {
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    id,
    method,
  };
  if (params !== undefined) body.params = params;

  const res = await fetch(cred.mcpUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let payload: JsonRpcResponse;
  try {
    payload = JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new Error(`Moss MCP 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(payload.error?.message || `Moss MCP HTTP ${res.status}`);
  }
  if (payload.error) {
    const code =
      payload.error.data && typeof payload.error.data === "object" && "error_code" in payload.error.data
        ? String((payload.error.data as { error_code?: string }).error_code)
        : "";
    const msg = payload.error.message || `Moss MCP 错误 ${payload.error.code ?? ""}`;
    throw new Error(code ? `${msg} (${code})` : msg);
  }
  return payload.result as T;
}

export async function testMossConnection(cred?: MossCredential | null) {
  const resolved = cred ?? (await resolveMossCredential());
  if (!resolved) throw new Error("未配置 Moss MCP 令牌（MOSS_MCP_TOKEN）");

  const init = await mossRpc<{
    serverInfo?: { name?: string; version?: string };
    instructions?: string;
  }>(resolved, "initialize", {
    protocolVersion: MOSS_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "partner-hub", version: "0.1" },
  });

  const listed = await mossRpc<{ tools?: MossTool[] }>(resolved, "tools/list", {}, 2);
  const tools = listed.tools ?? [];

  return {
    ok: true as const,
    serverName: init.serverInfo?.name ?? "moss",
    serverVersion: init.serverInfo?.version ?? "",
    instructions: init.instructions ?? "",
    toolCount: tools.length,
    toolNames: tools.map((t) => t.name),
    keyTail: resolved.token.slice(-4),
    mcpUrl: resolved.mcpUrl,
  };
}

export async function listMossTools(cred?: MossCredential | null): Promise<MossTool[]> {
  const resolved = cred ?? (await resolveMossCredential());
  if (!resolved) throw new Error("未配置 Moss MCP 令牌（MOSS_MCP_TOKEN）");
  const listed = await mossRpc<{ tools?: MossTool[] }>(resolved, "tools/list", {}, 2);
  return (listed.tools ?? []).map((t) => ({
    name: t.name,
    description: (t.description || "").trim(),
    inputSchema: t.inputSchema,
  }));
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function parseJsonText(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
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
  const structured = root.structuredContent ?? root.data ?? parseJsonText(text) ?? undefined;
  return { text, isError, structured };
}

function extractCompanyList(data: unknown): MossCompanyHit[] {
  const hits: MossCompanyHit[] = [];
  const push = (item: unknown) => {
    const row = asRecord(item);
    if (!row) return;
    const name = pickString(
      row.name,
      row.company_name,
      row.companyName,
      row.enterpriseName,
      row.entName,
      row.corpName,
      row.matchName,
    );
    const creditCode = pickString(
      row.credit_code,
      row.creditCode,
      row.unifiedSocialCreditCode,
      row.uscc,
    );
    if (!name && !creditCode) return;
    hits.push({
      name: name || creditCode,
      creditCode: creditCode || undefined,
      companyId: pickString(row.companyId, row.enterpriseId, row.entId, row.id, row.eid) || undefined,
      legalPerson: pickString(
        row.legalPerson,
        row.legal_person,
        row.legalRepresentative,
        row.operName,
      ) || undefined,
      status: pickString(row.status, row.regStatus, row.enterpriseStatus, row.reg_status) || undefined,
      registeredCapital:
        pickString(row.registeredCapital, row.regCapital, row.capital, row.reg_capital) || undefined,
      establishDate:
        pickString(row.establishDate, row.estiblishTime, row.startDate, row.foundDate, row.est_date) ||
        undefined,
      address: pickString(row.address, row.regLocation, row.dom, row.reg_address) || undefined,
      raw: row,
    });
  };

  if (Array.isArray(data)) {
    data.forEach(push);
    return hits;
  }

  const root = asRecord(data);
  if (!root) return hits;

  const candidates = [
    root.candidates,
    root.list,
    root.items,
    root.records,
    root.companies,
    root.result,
    root.data,
    asRecord(root.data)?.candidates,
    asRecord(root.data)?.list,
    asRecord(root.data)?.items,
    asRecord(root.result)?.list,
    asRecord(root.result)?.candidates,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      c.forEach(push);
      if (hits.length) return hits;
    }
  }

  // 单企业对象
  if (pickString(root.credit_code, root.creditCode, root.name, root.company_name)) {
    push(root);
  }
  return hits;
}

export async function callMossTool(
  toolName: string,
  args: Record<string, unknown>,
  cred?: MossCredential | null,
) {
  const resolved = cred ?? (await resolveMossCredential());
  if (!resolved) throw new Error("未配置 Moss MCP 令牌（MOSS_MCP_TOKEN）");

  const result = await mossRpc<unknown>(
    resolved,
    "tools/call",
    { name: toolName, arguments: args },
    3,
  );
  const parsed = parseToolContent(result);
  if (parsed.isError) {
    throw new Error(parsed.text || `Moss 工具 ${toolName} 调用失败`);
  }
  return {
    text: parsed.text,
    data: parsed.structured,
    raw: result,
  };
}

/** moss_company_search — 企业名不唯一时返回候选，后续必须用 credit_code */
export async function searchMossCompanies(keyword: string) {
  const q = keyword.trim();
  if (!q) throw new Error("请输入企业名称或关键词");

  const { text, data, raw } = await callMossTool("moss_company_search", {
    company_name: q,
  });

  let hits = extractCompanyList(data);
  if (!hits.length && text) {
    hits = extractCompanyList(parseJsonText(text));
  }

  return { hits, text, raw };
}

function formatSection(label: string, text: string, data?: unknown) {
  if (text) return `### ${label}\n${text}`;
  if (data !== undefined) return `### ${label}\n${JSON.stringify(data, null, 2)}`;
  return `### ${label}\n（无内容）`;
}

/** 企业画像 + 舆情；优先 credit_code，禁止静默猜主体 */
export async function fetchMossCompanyInsight(input: {
  creditCode?: string;
  companyName?: string;
}) {
  const creditCode = input.creditCode?.trim() || "";
  const companyName = input.companyName?.trim() || "";
  if (!creditCode && !companyName) throw new Error("请指定企业 credit_code 或名称");

  const sections: { tool: string; text: string; data?: unknown }[] = [];
  const errors: { tool: string; error: string }[] = [];

  if (creditCode) {
    try {
      const res = await callMossTool("moss_company_profile", { credit_code: creditCode });
      sections.push({ tool: "moss_company_profile", text: res.text, data: res.data });
    } catch (e) {
      errors.push({
        tool: "moss_company_profile",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else {
    errors.push({
      tool: "moss_company_profile",
      error: "缺少 credit_code。请先从搜索候选中选择企业，不要用名称直接猜主体。",
    });
  }

  const opinionKeyword = companyName || creditCode;
  try {
    const res = await callMossTool("moss_public_opinion_search", {
      keyword: opinionKeyword,
      limit: 10,
    });
    sections.push({ tool: "moss_public_opinion_search", text: res.text, data: res.data });
  } catch (e) {
    errors.push({
      tool: "moss_public_opinion_search",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    sections,
    errors,
    summary: [
      ...sections.map((s) => formatSection(s.tool, s.text, s.data)),
      ...errors.map((e) => `### ${e.tool}\n⚠ ${e.error}`),
    ].join("\n\n"),
  };
}
