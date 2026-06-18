/** Model builtin web search capability detection (standalone module to avoid skills ↔ sentiment-monitor circular deps) */

import { db } from "./db";

// Kimi (moonshot) builtin web search: inject as special tool; echo arguments when invoked
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

/** List all web-search-capable enabled APIs (same sort order as resolveAiApi) */
export async function listWebSearchBackends(): Promise<WebSearchBackend[]> {
  const configured = await db.aiApiConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, provider: true, baseUrl: true, extraConfig: true },
  });

  const backends: WebSearchBackend[] = [];

  for (const api of configured) {
    if (api.provider === "volcengine" && volcHasWebSearch(api.extraConfig)) {
      backends.push({ source: "db", apiId: api.id, name: api.name, kind: "volcengine" });
    }
  }

  for (const api of configured) {
    if (api.provider !== "volcengine" && isKimiBaseUrl(api.baseUrl)) {
      backends.push({ source: "db", apiId: api.id, name: api.name, kind: "kimi" });
    }
  }

  const envUrl = process.env.AI_BASE_URL ?? "";
  if (process.env.AI_API_KEY?.trim() && isKimiBaseUrl(envUrl)) {
    backends.push({ source: "env", kind: "kimi" });
  }

  return backends;
}

/** Find first web-search-capable enabled API (same sort order as resolveAiApi) */
export async function findWebSearchBackend(): Promise<WebSearchBackend | null> {
  const backends = await listWebSearchBackends();
  return backends[0] ?? null;
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
