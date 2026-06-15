/**
 * 通过大模型内置联网搜索（Kimi $web_search / 火山引擎 web_search）执行公开信息检索。
 * 不再依赖博查等第三方搜索 API。
 */

import { db } from "./db";
import {
  KIMI_BUILTIN_SEARCH,
  shouldUseBuiltinWebSearch,
  shouldUseKimiBuiltinSearch,
  shouldUseVolcengineBuiltinSearch,
} from "./builtin-search";

export type WebSearchResult =
  | { ok: true; text: string }
  | { ok: false; error: string; needsWebSearch?: boolean };

async function hasAiConfigured(): Promise<boolean> {
  return !!process.env.AI_API_KEY || (await db.aiApiConfig.count({ where: { enabled: true } })) > 0;
}

/** 当前环境是否可用模型内置联网搜索 */
export async function isWebSearchAvailable(): Promise<boolean> {
  if (!(await hasAiConfigured())) return false;
  return shouldUseBuiltinWebSearch();
}

export type ModelSearchMode = "general" | "news" | "linkedin";

function systemPrompt(mode: ModelSearchMode): string {
  if (mode === "linkedin") {
    return `你是 LinkedIn 公开信息检索助手。请用联网搜索查找目标公司/高管在 LinkedIn 上的公开页面、职业信息与近期动态摘要。
要求：只输出与检索目标直接相关的结果；每条含标题、链接、摘要、日期（如有）；中文整理；不要分析或编造。`;
  }
  if (mode === "news") {
    return `你是新闻与公开信息检索助手。请用联网搜索查找与检索词相关的最新新闻、公告与公开报道。
要求：只输出直接相关结果；每条含标题、链接、摘要、日期；中文整理；不要分析或编造。`;
  }
  return `你是公开信息检索助手。请用联网搜索查找与检索词相关的公开网页信息。
要求：只输出直接相关结果；每条含标题、链接、摘要、日期（如有）；中文整理；不要分析或编造。`;
}

/** 调用支持联网的大模型执行一次搜索，返回整理后的文本 */
export async function modelWebSearch(
  query: string,
  opts: { feature?: string; mode?: ModelSearchMode; userId?: string | null } = {},
): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: "搜索词为空" };

  if (!(await isWebSearchAvailable())) {
    return {
      ok: false,
      needsWebSearch: true,
      error:
        "未配置支持联网搜索的大模型。请在设置中启用 Kimi（moonshot）或火山引擎（extra.tools 含 web_search）的 API。",
    };
  }

  const useKimi = await shouldUseKimiBuiltinSearch();
  const tools = useKimi ? [KIMI_BUILTIN_SEARCH] : [];

  const { runToolLoop } = await import("./ai-tool-loop");
  const text = await runToolLoop({
    chat: [
      { role: "system", content: systemPrompt(opts.mode ?? "general") },
      { role: "user", content: q },
    ],
    tools,
    temperature: 0.3,
    feature: opts.feature ?? "模型联网搜索",
    userId: opts.userId ?? undefined,
    streamReply: false,
    maxSteps: 8,
    executeTool: async (tc) => {
      if (tc.function.name === "$web_search") return tc.function.arguments;
      return "（无可用工具）";
    },
  });

  if (!text?.trim()) {
    return { ok: false, error: "搜索未返回结果，请换一组关键词重试" };
  }
  return { ok: true, text: text.trim() };
}

/** @deprecated 兼容旧名；语义改为「模型联网搜索是否可用」 */
export async function hasWebSearchKey(): Promise<boolean> {
  return isWebSearchAvailable();
}

/** 通用公开网络搜索 */
export async function generalWebSearch(
  query: string,
  _maxResults = 5,
  topic?: "news",
): Promise<WebSearchResult> {
  return modelWebSearch(query, {
    feature: "新闻搜索",
    mode: topic === "news" ? "news" : "general",
  });
}

/** 领英公开内容搜索 */
export async function linkedinSearch(args: {
  query?: string;
  company?: string;
  person?: string;
  topic?: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const parts = [args.company, args.person, args.topic, args.query].filter(Boolean).map(String);
  if (!parts.length) {
    return { ok: false, error: "请提供 company、person 或 query 至少一项" };
  }
  const q = `${parts.join(" ")} LinkedIn`.trim();
  return modelWebSearch(q, { feature: "领英搜索", mode: "linkedin" });
}

/** 供日志/调试：当前使用的搜索后端 */
export async function webSearchBackendLabel(): Promise<string> {
  if (await shouldUseVolcengineBuiltinSearch()) return "火山引擎内置 web_search";
  if (await shouldUseKimiBuiltinSearch()) return "Kimi 内置 $web_search";
  return "未配置";
}
