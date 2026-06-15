/** 舆情监控核心：联网扫描伙伴公开信息 → AI 判定维度/情感 → 去重入库 */

import type { MonitorSource, Partner } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { runToolLoop } from "./ai-tool-loop";
import { generalWebSearch, hasWebSearchKey, linkedinSearch } from "./web-search";
import {
  KIMI_BUILTIN_SEARCH,
  shouldUseKimiBuiltinSearch,
  shouldUseVolcengineBuiltinSearch,
} from "./builtin-search";
import {
  MONITOR_DIMENSIONS,
  MONITOR_DIMENSION_KEYWORDS,
  MONITOR_DIMENSION_LABELS,
  MONITOR_SENTIMENT_LABELS,
} from "./constants";

export type ScanResult = {
  ok: boolean;
  error?: string;
  needsWebSearch?: boolean;
  scanned: number; // 抓取到的原始结果块数
  created: number; // 新入库条目数
  bySentiment: Record<string, number>;
};

type ClassifiedItem = {
  dimension: string;
  sentiment: string;
  title: string;
  summary?: string;
  url?: string;
  sourceName?: string;
  publishedAt?: string;
};

const VALID_SENTIMENTS = Object.keys(MONITOR_SENTIMENT_LABELS);
const MAX_RAW_CHARS = 24000;

/** 只保留合法维度；空即空（由用户/调用方显式指定，不再默认全部） */
export function resolveDims(monitorDims: string | null | undefined, optDims?: string[]): string[] {
  let dims = optDims;
  if (!dims && monitorDims) {
    try {
      const parsed = JSON.parse(monitorDims);
      if (Array.isArray(parsed)) dims = parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  return (dims ?? []).filter((d) => MONITOR_DIMENSIONS.includes(d));
}

/** 从官网 URL 提取裸域名（去 www / 协议 / 路径），失败返回空 */
function hostFromWebsite(website: string | null | undefined): string {
  if (!website) return "";
  try {
    const h = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    return h.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** 公司名含空格时加引号，做短语锚定，降低缩写/通用名误召回 */
function quoteName(name: string): string {
  const n = name.trim();
  return /\s/.test(n) ? `"${n}"` : n;
}

/** 去掉所有非 ASCII（含中文），用于非中文地区伙伴，避免中文关键词把中国招标/资讯网拉成噪声 */
function stripNonAscii(s: string): string {
  return s.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").trim();
}

/** 是否中文地区伙伴（仅这类保留中英混排关键词） */
function isChineseRegion(country: string | null | undefined): boolean {
  if (!country) return false;
  return /中国|中華|中国大陆|大陆|香港|台湾|澳门|china|prc|hong\s?kong|taiwan|macau|\bcn\b|\bhk\b|\btw\b/i.test(country);
}

/** 按维度构造搜索词（中东等非中文地区用纯英文关键词） */
export function buildDimensionQueries(
  partner: Pick<Partner, "name" | "country" | "city" | "website">,
  dims: string[],
): { dimension: string; query: string; topic?: "news" }[] {
  // 用「国家 + 官网域名」做上下文锚定；刻意不用中文城市名（如“利雅得”会被搜成足球俱乐部等噪声）
  const host = hostFromWebsite(partner.website);
  const ctx = [partner.country, host].filter(Boolean).join(" ");
  const nameToken = quoteName(partner.name);
  const cn = isChineseRegion(partner.country);
  return dims.map((dimension) => {
    const rawKw = MONITOR_DIMENSION_KEYWORDS[dimension] ?? "";
    const kw = cn ? rawKw : stripNonAscii(rawKw);
    const query = `${nameToken} ${ctx} ${kw}`.replace(/\s+/g, " ").trim();
    const topic = dimension === "NEWS" || dimension === "DEALS" || dimension === "RISK" ? "news" : undefined;
    return { dimension, query, topic };
  });
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

function dedupeKeyFor(item: ClassifiedItem): string {
  if (item.url) return normalizeUrl(item.url).slice(0, 300);
  return `t:${item.title.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120)}`;
}

/** 通过博查逐维度/逐自定义源抓取原始结果 */
async function gatherViaBocha(
  partner: Pick<Partner, "name" | "country" | "city" | "website">,
  dims: string[],
  sources: MonitorSource[],
  maxPerQuery: number,
): Promise<string[]> {
  const blocks: string[] = [];

  for (const { dimension, query, topic } of buildDimensionQueries(partner, dims)) {
    const r = await generalWebSearch(query, maxPerQuery, topic);
    if (r.ok) blocks.push(`### 维度提示：${MONITOR_DIMENSION_LABELS[dimension]}\n${r.text}`);
  }

  const nameToken = quoteName(partner.name);
  for (const s of sources) {
    if (!s.enabled) continue;
    const domain = (s.domain ?? "").toLowerCase();
    let r;
    if (s.sourceType === "LINKEDIN" || domain.includes("linkedin")) {
      r = await linkedinSearch({ company: partner.name, maxResults: maxPerQuery });
    } else {
      // 注意：博查不支持 site: 过滤，这里把域名作为关键词锚定，而非 site: 语法
      const siteQuery = domain ? `${nameToken} ${domain}` : `${nameToken} ${s.label}`;
      r = await generalWebSearch(siteQuery, maxPerQuery);
    }
    if (r.ok) blocks.push(`### 自定义监控源：${s.label}（${s.url}）\n${r.text}`);
  }

  return blocks;
}

/** 无博查 Key 时，借助模型内置联网搜索抓取原始结果 */
async function gatherViaBuiltinSearch(
  partner: Pick<Partner, "name" | "country" | "city" | "website">,
  dims: string[],
  sources: MonitorSource[],
): Promise<string[]> {
  const useVolc = await shouldUseVolcengineBuiltinSearch();
  const useKimi = !useVolc && (await shouldUseKimiBuiltinSearch());
  if (!useVolc && !useKimi) return [];

  const queries = buildDimensionQueries(partner, dims).map((q) => q.query);
  const sourceHints = sources
    .filter((s) => s.enabled)
    .map((s) => `${s.label}：${s.url}`)
    .join("\n");

  const tools = useKimi ? [KIMI_BUILTIN_SEARCH] : [];
  const system = `你是舆情情报采集助手。请用联网搜索为合作伙伴「${partner.name}」检索以下方向的公开信息，把找到的标题、来源、链接、摘要原样整理输出（中文），不要分析。`;
  const user = `检索方向：\n${queries.join("\n")}\n\n${sourceHints ? `重点关注以下来源：\n${sourceHints}` : ""}`;

  const text = await runToolLoop({
    chat: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools,
    temperature: 0.3,
    feature: "舆情监控采集",
    streamReply: false,
    maxSteps: 8,
    executeTool: async (tc) => {
      if (tc.function.name === "$web_search") return tc.function.arguments;
      return "（无可用工具）";
    },
  });

  return text ? [text] : [];
}

/** 用 AI 把原始结果整理成结构化舆情条目 */
async function classify(
  partner: Pick<Partner, "name" | "country">,
  dims: string[],
  raw: string,
): Promise<ClassifiedItem[]> {
  const allowed = dims.length ? dims : MONITOR_DIMENSIONS;
  const dimList = allowed.map((d) => `${d}(${MONITOR_DIMENSION_LABELS[d]})`).join("、");
  const system = `你是 BI 厂商帆软的中东伙伴舆情分析助手。下面是关于合作伙伴「${partner.name}」（${partner.country ?? "中东"}）的联网搜索原始结果。
请提炼出与该公司**直接相关**的舆情条目，剔除无关、重复、纯目录页结果。
- dimension 只能取：${dimList}
- sentiment 取：POSITIVE(正面/机会)、NEUTRAL(中性)、NEGATIVE(负面)、RISK(高风险预警)
- title 用一句中文概括；summary 写 1-2 句中文要点；url 用原文链接；sourceName 写来源站点；publishedAt 若有日期写 YYYY-MM-DD，否则留空。
只输出 JSON：{"items":[{"dimension","sentiment","title","summary","url","sourceName","publishedAt"}]}。最多 30 条，没有相关内容则 items 为空数组。`;

  const { items } = await chatJson<{ items?: ClassifiedItem[] }>(system, raw.slice(0, MAX_RAW_CHARS), {
    feature: "舆情监控分类",
    temperature: 0.2,
  });
  if (!Array.isArray(items)) return [];
  return items
    .filter((it) => it && typeof it.title === "string" && it.title.trim())
    .map((it) => ({
      dimension: MONITOR_DIMENSIONS.includes(it.dimension) ? it.dimension : "NEWS",
      sentiment: VALID_SENTIMENTS.includes(it.sentiment) ? it.sentiment : "NEUTRAL",
      title: it.title.trim().slice(0, 300),
      summary: it.summary?.toString().trim().slice(0, 1000) || undefined,
      url: it.url?.toString().trim() || undefined,
      sourceName: it.sourceName?.toString().trim().slice(0, 120) || undefined,
      publishedAt: it.publishedAt?.toString().trim() || undefined,
    }));
}

/** 对单个伙伴执行一次舆情扫描 */
export async function scanPartnerSentiment(
  partnerId: string,
  opts: { dims?: string[]; userId?: string | null; maxPerQuery?: number } = {},
): Promise<ScanResult> {
  const empty: ScanResult = { ok: false, scanned: 0, created: 0, bySentiment: {} };

  const hasAi =
    !!process.env.AI_API_KEY || (await db.aiApiConfig.count({ where: { enabled: true } })) > 0;
  if (!hasAi) {
    return { ...empty, error: "未配置 AI 模型，无法分析舆情。请先在设置中配置 AI API。" };
  }

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    include: { monitorSources: true },
  });
  if (!partner) return { ...empty, error: "找不到该伙伴" };

  const dims = resolveDims(partner.monitorDims, opts.dims);
  const sources = partner.monitorSources;
  const maxPerQuery = opts.maxPerQuery ?? 4;

  const hasEnabledSource = sources.some((s) => s.enabled);
  if (!dims.length && !hasEnabledSource) {
    return { ...empty, ok: true, error: "请先选择要监控的维度，或添加监控链接源" };
  }

  let blocks: string[];
  if (hasWebSearchKey()) {
    blocks = await gatherViaBocha(partner, dims, sources, maxPerQuery);
  } else {
    blocks = await gatherViaBuiltinSearch(partner, dims, sources);
    if (!blocks.length) {
      return {
        ...empty,
        needsWebSearch: true,
        error:
          "未配置联网搜索能力（博查 BOCHA_API_KEY 或支持内置联网搜索的模型）。请在 .env / 设置中配置后重试。",
      };
    }
  }

  const raw = blocks.join("\n\n");
  if (!raw.trim()) {
    return { ...empty, ok: true, error: "本次未抓取到公开信息" };
  }

  const items = await classify(partner, dims, raw);

  // 去重：库内已有 + 本批内
  const existing = await db.monitorItem.findMany({
    where: { partnerId },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  const bySentiment: Record<string, number> = {};
  let created = 0;

  for (const it of items) {
    const key = dedupeKeyFor(it);
    if (seen.has(key)) continue;
    seen.add(key);

    const sourceType = it.url?.includes("linkedin.com") ? "linkedin" : "web";
    let publishedAt: Date | null = null;
    if (it.publishedAt) {
      const d = new Date(it.publishedAt);
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }

    await db.monitorItem.create({
      data: {
        partnerId,
        dimension: it.dimension,
        sentiment: it.sentiment,
        title: it.title,
        summary: it.summary ?? null,
        url: it.url ?? null,
        sourceName: it.sourceName ?? null,
        sourceType,
        publishedAt,
        dedupeKey: key,
      },
    });
    created++;
    bySentiment[it.sentiment] = (bySentiment[it.sentiment] ?? 0) + 1;
  }

  return { ok: true, scanned: blocks.length, created, bySentiment };
}
