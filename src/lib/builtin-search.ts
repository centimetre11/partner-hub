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

/** Find first web-search-capable enabled API (same sort order as resolveAiApi) */
export async function findWebSearchBackend(): Promise<WebSearchBackend | null> {
  const configured = await db.aiApiConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, provider: true, baseUrl: true, extraConfig: true },
  });

  // Prefer: Volcengine with web_search in extra.tools
  for (const api of configured) {
    if (api.provider === "volcengine" && volcHasWebSearch(api.extraConfig)) {
      return { source: "db", apiId: api.id, name: api.name, kind: "volcengine" };
    }
  }

  // Next: Kimi (moonshot)
  for (const api of configured) {
    if (api.provider !== "volcengine" && isKimiBaseUrl(api.baseUrl)) {
      return { source: "db", apiId: api.id, name: api.name, kind: "kimi" };
    }
  }

  // Fallback: Kimi from .env
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
