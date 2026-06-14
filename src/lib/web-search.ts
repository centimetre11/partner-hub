/** Tavily 联网搜索 — Agent 侧 server-side 执行（LinkedIn / 新闻 / 竞品） */

export type WebSearchResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
  needsTavily?: boolean;
};

export function hasTavilyKey() {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

function formatTavilyResponse(data: {
  answer?: string;
  results?: Array<{ title: string; url: string; content?: string }>;
}) {
  const items = (data.results ?? [])
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${(r.content ?? "").slice(0, 400)}`
    )
    .join("\n");
  return [data.answer && `摘要：${data.answer}`, items].filter(Boolean).join("\n\n") || "没有搜索结果";
}

export async function tavilySearch(opts: {
  query: string;
  maxResults?: number;
  includeDomains?: string[];
  topic?: "general" | "news";
}): Promise<WebSearchResult> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      needsTavily: true,
      error:
        "未配置 TAVILY_API_KEY。请在服务器 .env 中填写 Tavily Key（https://tavily.com 有免费额度），然后 docker compose up -d --build 重启。LinkedIn 与新闻搜索依赖此配置。",
    };
  }

  const body: Record<string, unknown> = {
    api_key: key,
    query: opts.query,
    max_results: opts.maxResults ?? 5,
    include_answer: true,
  };
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains;
  if (opts.topic) body.topic = opts.topic;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 200);
      return { ok: false, error: `Tavily 搜索失败（${res.status}）：${errText}` };
    }
    const data = await res.json();
    const text = formatTavilyResponse(data);
    if (!text || text === "没有搜索结果") return { ok: false, error: "没有搜索结果，请换一组关键词（中英文都试）" };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `搜索请求失败：${e instanceof Error ? e.message : e}` };
  }
}

/** 领英公开内容搜索（公司页、个人页、动态摘要） */
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
  return tavilySearch({
    query: q,
    maxResults: args.maxResults ?? 5,
    includeDomains: ["linkedin.com"],
  });
}

/** 通用公开网络搜索（新闻、招聘、中标、竞品） */
export async function generalWebSearch(query: string, maxResults = 5, topic?: "news") {
  return tavilySearch({ query, maxResults, topic });
}
