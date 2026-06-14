/** 博查联网搜索 — Agent 侧 server-side 执行（LinkedIn / 新闻 / 竞品） */

export type WebSearchResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
  needsWebSearch?: boolean;
};

export function hasWebSearchKey() {
  return Boolean(process.env.BOCHA_API_KEY?.trim());
}

type BochaWebPage = {
  name?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  siteName?: string;
  datePublished?: string;
};

function formatBochaResponse(data: { data?: { webPages?: { value?: BochaWebPage[] } } }) {
  const pages = data.data?.webPages?.value ?? [];
  const items = pages
    .map((r, i) => {
      const content = (r.summary || r.snippet || "").slice(0, 400);
      const site = r.siteName ? ` (${r.siteName})` : "";
      const date = r.datePublished ? ` · ${r.datePublished.slice(0, 10)}` : "";
      return `${i + 1}. ${r.name ?? "无标题"}${site}${date}\n   ${r.url ?? ""}\n   ${content}`;
    })
    .join("\n");
  return items || "没有搜索结果";
}

const WEB_SEARCH_NOT_CONFIGURED =
  "未配置 BOCHA_API_KEY。请在 .env 中填写博查 Key（https://open.bocha.cn），然后重启服务。LinkedIn 与新闻搜索依赖此配置。";

async function bochaSearch(opts: {
  query: string;
  maxResults?: number;
  freshness?: string;
}): Promise<WebSearchResult> {
  const key = process.env.BOCHA_API_KEY?.trim();
  if (!key) {
    return { ok: false, needsWebSearch: true, error: WEB_SEARCH_NOT_CONFIGURED };
  }

  const body = {
    query: opts.query,
    summary: true,
    freshness: opts.freshness ?? "noLimit",
    count: Math.min(Math.max(opts.maxResults ?? 5, 1), 50),
  };

  try {
    const res = await fetch("https://api.bocha.cn/v1/web-search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 200);
      return { ok: false, error: `博查搜索失败（${res.status}）：${errText}` };
    }
    const data = (await res.json()) as { code?: number; msg?: string; data?: { webPages?: { value?: BochaWebPage[] } } };
    if (data.code !== undefined && data.code !== 200) {
      return { ok: false, error: `博查搜索失败：${data.msg ?? `code ${data.code}`}` };
    }
    const text = formatBochaResponse(data);
    if (!text || text === "没有搜索结果") {
      return { ok: false, error: "没有搜索结果，请换一组关键词（中英文都试）" };
    }
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: `搜索请求失败：${e instanceof Error ? e.message : e}` };
  }
}

async function webSearch(opts: {
  query: string;
  maxResults?: number;
  includeDomains?: string[];
  topic?: "general" | "news";
}): Promise<WebSearchResult> {
  let query = opts.query;
  if (opts.includeDomains?.length) {
    query = `${query} ${opts.includeDomains.map((d) => `site:${d}`).join(" ")}`.trim();
  }
  const freshness = opts.topic === "news" ? "oneMonth" : "noLimit";
  return bochaSearch({ query, maxResults: opts.maxResults, freshness });
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
  return webSearch({
    query: q,
    maxResults: args.maxResults ?? 5,
    includeDomains: ["linkedin.com"],
  });
}

/** 通用公开网络搜索（新闻、招聘、中标、竞品） */
export async function generalWebSearch(query: string, maxResults = 5, topic?: "news") {
  return webSearch({ query, maxResults, topic });
}
