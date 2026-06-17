/**
 * Web search via model builtin search (Kimi $web_search / Volcengine web_search).
 * Auto-picks a web-capable enabled API — not necessarily the default model.
 */

import { db } from "./db";
import { findWebSearchBackend, KIMI_BUILTIN_SEARCH } from "./builtin-search";

export type WebSearchResult =
  | { ok: true; text: string }
  | { ok: false; error: string; needsWebSearch?: boolean };

async function hasAiConfigured(): Promise<boolean> {
  return !!process.env.AI_API_KEY || (await db.aiApiConfig.count({ where: { enabled: true } })) > 0;
}

/** Whether model builtin web search is available in this environment */
export async function isWebSearchAvailable(): Promise<boolean> {
  if (!(await hasAiConfigured())) return false;
  return !!(await findWebSearchBackend());
}

export type ModelSearchMode = "general" | "news" | "linkedin";

function systemPrompt(mode: ModelSearchMode): string {
  if (mode === "linkedin") {
    return `You are a LinkedIn public information search assistant. Use web search to find target company/executive LinkedIn pages, career info, and recent activity summaries.
Requirements: only results directly related to the search target; each item with title, link, summary, date (if any); format in English; do not analyze or fabricate.`;
  }
  if (mode === "news") {
    return `You are a news and public information search assistant. Use web search for latest news, announcements, and public coverage related to the query.
Requirements: only directly related results; each item with title, link, summary, date; format in English; do not analyze or fabricate.`;
  }
  return `You are a public web information search assistant. Use web search for public pages related to the query.
Requirements: only directly related results; each item with title, link, summary, date (if any); format in English; do not analyze or fabricate.`;
}

/** Run one search via a web-capable model; returns formatted text */
export async function modelWebSearch(
  query: string,
  opts: { feature?: string; mode?: ModelSearchMode; userId?: string | null } = {},
): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Search query is empty" };

  const backend = await findWebSearchBackend();
  if (!backend) {
    return {
      ok: false,
      needsWebSearch: true,
      error:
        "No enabled model with web search found. Add Kimi (moonshot) or Volcengine (tools include web_search) in Settings and enable it.",
    };
  }

  const tools = backend.kind === "kimi" ? [KIMI_BUILTIN_SEARCH] : [];
  const apiConfigId = backend.source === "db" ? backend.apiId : undefined;

  const { runToolLoop } = await import("./ai-tool-loop");
  const text = await runToolLoop({
    chat: [
      { role: "system", content: systemPrompt(opts.mode ?? "general") },
      { role: "user", content: q },
    ],
    tools,
    temperature: 0.3,
    feature: opts.feature ?? "Model web search",
    userId: opts.userId ?? undefined,
    apiConfigId,
    streamReply: false,
    maxSteps: 8,
    executeTool: async (tc) => {
      if (tc.function.name === "$web_search") return tc.function.arguments;
      return "(no tools available)";
    },
  });

  if (!text?.trim()) {
    return { ok: false, error: "Search returned no results; try different keywords" };
  }
  return { ok: true, text: text.trim() };
}

/** @deprecated Legacy alias; means whether model web search is available */
export async function hasWebSearchKey(): Promise<boolean> {
  return isWebSearchAvailable();
}

/** General public web search */
export async function generalWebSearch(
  query: string,
  _maxResults = 5,
  topic?: "news",
): Promise<WebSearchResult> {
  return modelWebSearch(query, {
    feature: "News search",
    mode: topic === "news" ? "news" : "general",
  });
}

/** LinkedIn public content search */
export async function linkedinSearch(args: {
  query?: string;
  company?: string;
  person?: string;
  topic?: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const parts = [args.company, args.person, args.topic, args.query].filter(Boolean).map(String);
  if (!parts.length) {
    return { ok: false, error: "Provide at least one of company, person, or query" };
  }
  const q = `${parts.join(" ")} LinkedIn`.trim();
  return modelWebSearch(q, { feature: "LinkedIn search", mode: "linkedin" });
}

/** For UI: which model actually handles web search */
export async function webSearchBackendLabel(): Promise<string> {
  const b = await findWebSearchBackend();
  if (!b) return "Not configured";
  if (b.kind === "volcengine") {
    const name = b.source === "db" ? b.name : "Volcengine";
    return `${name} (builtin web_search)`;
  }
  const name = b.source === "db" ? b.name : "Environment Kimi";
  return `${name} ($web_search)`;
}
