/** 模型内置联网搜索能力探测（独立模块，避免 skills ↔ sentiment-monitor 循环依赖） */

import { db } from "./db";

// Kimi（moonshot）平台的内置联网搜索：作为特殊工具注入，工具被调用时原样回传参数即可
export const KIMI_BUILTIN_SEARCH = {
  type: "builtin_function" as const,
  function: { name: "$web_search" },
};

export type WebSearchBackend =
  | { source: "db"; apiId: string; name: string; kind: "volcengine" | "kimi" }
  | { source: "env"; kind: "kimi" };

function volcHasWebSearch(extraConfig: string | null | undefined): boolean {
  try {
    const extra = JSON.parse(extraConfig ?? "{}") as { tools?: Array<{ type?: string }> };
    return (extra.tools ?? []).some((t) => t.type === "web_search");
  } catch {
    return false;
  }
}

function isKimiBaseUrl(baseUrl: string | null | undefined): boolean {
  return (baseUrl ?? "").includes("moonshot");
}

/** 从全部已启用 API 中找第一个支持联网搜索的配置（与 resolveAiApi 相同排序） */
export async function findWebSearchBackend(): Promise<WebSearchBackend | null> {
  const configured = await db.aiApiConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, provider: true, baseUrl: true, extraConfig: true },
  });

  // 优先：火山引擎且 extra.tools 含 web_search
  for (const api of configured) {
    if (api.provider === "volcengine" && volcHasWebSearch(api.extraConfig)) {
      return { source: "db", apiId: api.id, name: api.name, kind: "volcengine" };
    }
  }

  // 其次：Kimi（moonshot）
  for (const api of configured) {
    if (api.provider !== "volcengine" && isKimiBaseUrl(api.baseUrl)) {
      return { source: "db", apiId: api.id, name: api.name, kind: "kimi" };
    }
  }

  // 兜底：.env 里的 Kimi
  const envUrl = process.env.AI_BASE_URL ?? "";
  if (process.env.AI_API_KEY?.trim() && isKimiBaseUrl(envUrl)) {
    return { source: "env", kind: "kimi" };
  }

  return null;
}

export async function shouldUseBuiltinWebSearch(): Promise<boolean> {
  return !!(await findWebSearchBackend());
}

export async function shouldUseVolcengineBuiltinSearch(): Promise<boolean> {
  const b = await findWebSearchBackend();
  return b?.kind === "volcengine";
}

export async function shouldUseKimiBuiltinSearch(): Promise<boolean> {
  const b = await findWebSearchBackend();
  return b?.kind === "kimi";
}
