/** Model builtin web search capability detection (standalone module to avoid skills ↔ sentiment-monitor circular deps) */

import { db } from "./db";
import { getSceneAssignments, orderedSceneApiIds, type LlmScene } from "./llm-scenes";

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

/**
 * List all web-search-capable enabled APIs.
 * 默认按 priority 排序；传入 scene 时，先按该场景的「场景模型分配」顺序排，
 * 其余仍按 priority 兜底。这样线索研究等场景可指定优先用哪个联网搜索模型。
 */
export async function listWebSearchBackends(opts?: { scene?: LlmScene }): Promise<WebSearchBackend[]> {
  const configured = await db.aiApiConfig.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, provider: true, baseUrl: true, extraConfig: true },
  });

  let ordered = configured;
  if (opts?.scene) {
    const assignments = await getSceneAssignments();
    const preferred = orderedSceneApiIds(assignments, opts.scene);
    if (preferred.length) {
      const rank = new Map(preferred.map((id, i) => [id, i] as const));
      ordered = [...configured].sort((a, b) => {
        const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
    }
  }

  const backends: WebSearchBackend[] = [];

  for (const api of ordered) {
    if (api.provider === "volcengine" && volcHasWebSearch(api.extraConfig)) {
      backends.push({ source: "db", apiId: api.id, name: api.name, kind: "volcengine" });
    }
  }

  for (const api of ordered) {
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
