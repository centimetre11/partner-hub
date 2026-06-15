/** 舆情监控核心：联网扫描伙伴公开信息 → AI 判定维度/情感 → 去重入库 */

import type { MonitorSource, Partner } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { generalWebSearch, isWebSearchAvailable, linkedinSearch, webSearchBackendLabel } from "./web-search";
import {
  fetchCompanyUpdates,
  hasNinjaPearKey,
  linkedInSlugToLabel,
  normalizeLinkedInCompanyUrl,
} from "./ninjapearl";
import {
  MONITOR_DIMENSIONS,
  MONITOR_DIMENSION_KEYWORDS,
  MONITOR_DIMENSION_LABELS,
  MONITOR_SENTIMENT_LABELS,
} from "./constants";

export type ScanStepStatus = "ok" | "skip" | "fail" | "warn";

export type ScanStep = {
  label: string;
  status: ScanStepStatus;
  detail?: string;
  /** 抓取内容摘要（调试用） */
  preview?: string;
};

export type ScanResult = {
  ok: boolean;
  error?: string;
  needsWebSearch?: boolean;
  scanned: number; // 抓取到的原始结果块数
  created: number; // 新入库条目数
  bySentiment: Record<string, number>;
  /** 扫描过程日志（展示给用户） */
  steps?: ScanStep[];
  /** AI 分类出的条目数（含去重前） */
  classified?: number;
  /** 使用的联网搜索后端 */
  searchBackend?: string;
  /** 原始抓取总字符数 */
  rawChars?: number;
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

function previewText(text: string, max = 280): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** 档案未填官网时，从已启用监控源域名推断 */
function effectiveWebsite(
  partner: Pick<Partner, "website">,
  sources: MonitorSource[],
): string | undefined {
  if (partner.website?.trim()) return partner.website.trim();
  for (const s of sources) {
    if (!s.enabled) continue;
    const domain = (s.domain ?? "").toLowerCase();
    if (!domain || domain.includes("linkedin") || domain.includes("facebook") || domain.includes("twitter")) {
      continue;
    }
    return `https://${domain}`;
  }
  return undefined;
}

function searchContextLine(partner: Pick<Partner, "name" | "country" | "website">): string {
  const host = hostFromWebsite(partner.website);
  return [
    `公司全称：${partner.name}`,
    partner.country ? `国家/地区：${partner.country}` : null,
    partner.website ? `官网：${partner.website}` : null,
    host ? `域名锚点：${host}` : null,
  ]
    .filter(Boolean)
    .join("；");
}

type GatherResult = { blocks: string[]; steps: ScanStep[] };

/** 通过大模型内置联网搜索 + NinjaPear 抓取原始结果（逐步记录日志） */
async function gatherViaModelSearch(
  partner: Pick<Partner, "name" | "country" | "city" | "website">,
  dims: string[],
  sources: MonitorSource[],
): Promise<GatherResult> {
  const blocks: string[] = [];
  const steps: ScanStep[] = [];
  const canSearch = await isWebSearchAvailable();
  const backendLabel = await webSearchBackendLabel();
  const enabledSources = sources.filter((s) => s.enabled);

  steps.push({
    label: "准备",
    status: canSearch || hasNinjaPearKey() ? "ok" : "warn",
    detail: [
      canSearch ? `联网：${backendLabel}` : "无联网后端",
      `维度 ${dims.length} 个`,
      `自定义源 ${enabledSources.length} 个`,
    ].join(" · "),
  });

  const inferredWebsite = effectiveWebsite(partner, sources);
  const searchPartner =
    inferredWebsite && !partner.website?.trim() ? { ...partner, website: inferredWebsite } : partner;

  if (inferredWebsite && !partner.website?.trim()) {
    steps.push({
      label: "推断官网",
      status: "ok",
      detail: `档案未填官网，从监控源推断：${inferredWebsite}`,
    });
  }

  const ctxLine = searchContextLine(searchPartner);
  const dimQueries = buildDimensionQueries(searchPartner, dims);

  if (dimQueries.length && !canSearch) {
    steps.push({ label: "维度检索", status: "skip", detail: "无联网后端，已跳过各维度检索" });
  }

  for (const { dimension, query, topic } of dimQueries) {
    const dimLabel = MONITOR_DIMENSION_LABELS[dimension];
    if (!canSearch) continue;

    const userQuery =
      `只搜索与以下合作伙伴直接相关的公开信息，排除同名无关公司、中国国内无关新闻、体育/娱乐噪声。\n` +
      `${ctxLine}\n检索方向：${query}`;

    const r = await generalWebSearch(userQuery, 5, topic);
    if (r.ok) {
      blocks.push(`### [${dimLabel}] 维度检索\n${r.text}`);
      steps.push({
        label: `检索·${dimLabel}`,
        status: "ok",
        detail: `查询：${query.slice(0, 140)}${query.length > 140 ? "…" : ""}`,
        preview: previewText(r.text),
      });
    } else {
      steps.push({
        label: `检索·${dimLabel}`,
        status: "fail",
        detail: r.error,
      });
    }
  }

  // 各维度结果过少时，补一次公司综合检索
  const dimRaw = blocks.filter((b) => b.includes("维度检索")).join("\n");
  if (canSearch && dims.length > 0 && dimRaw.length < 800) {
    const host = hostFromWebsite(searchPartner.website);
    const fallbackQ = `${quoteName(partner.name)} ${partner.country ?? ""} ${host} company profile news updates`;
    const r = await generalWebSearch(
      `补充综合检索：${ctxLine}\n关键词：${fallbackQ}`,
      6,
    );
    if (r.ok && r.text.trim()) {
      blocks.push(`### 综合补充检索\n${r.text}`);
      steps.push({
        label: "补充·综合检索",
        status: "ok",
        detail: "各维度结果较少，已追加一次公司综合搜索",
        preview: previewText(r.text),
      });
    } else if (!r.ok) {
      steps.push({ label: "补充·综合检索", status: "warn", detail: r.error });
    }
  }

  const nameToken = quoteName(partner.name);
  for (const s of enabledSources) {
    const domain = (s.domain ?? "").toLowerCase();
    const isLinkedIn = s.sourceType === "LINKEDIN" || domain.includes("linkedin");

    if (isLinkedIn) {
      const website = searchPartner.website?.trim();
      if (hasNinjaPearKey() && website) {
        const np = await fetchCompanyUpdates(website);
        if (np.ok) {
          blocks.push(
            `### 自定义监控源：${s.label}（${normalizeLinkedInCompanyUrl(s.url)}）\n` +
              `数据来源：NinjaPear 公司公开更新（官网 ${website}）\n${np.text}`,
          );
          steps.push({
            label: `源·${s.label}`,
            status: "ok",
            detail: `NinjaPear 按官网 ${website} 拉取`,
            preview: previewText(np.text),
          });
          continue;
        }
        steps.push({
          label: `源·${s.label}`,
          status: "fail",
          detail: `NinjaPear：${np.error}`,
        });
      } else if (!hasNinjaPearKey()) {
        steps.push({
          label: `源·${s.label}`,
          status: "warn",
          detail: "未配置 NINJAPEARL_API_KEY，无法按官网拉取",
        });
      } else if (!website) {
        steps.push({
          label: `源·${s.label}`,
          status: "warn",
          detail: "伙伴档案未填官网且无法从监控源推断，NinjaPear 跳过",
        });
      }

      if (canSearch) {
        const slugLabel = linkedInSlugToLabel(s.url);
        const r = await linkedinSearch({
          company: slugLabel || partner.name,
          query: s.url,
          maxResults: 6,
        });
        if (r.ok) {
          blocks.push(`### 自定义监控源：${s.label}（${s.url}）\n${r.text}`);
          steps.push({
            label: `源·${s.label}（联网）`,
            status: "ok",
            detail: `LinkedIn 公开页检索：${s.url}`,
            preview: previewText(r.text),
          });
        } else {
          steps.push({ label: `源·${s.label}（联网）`, status: "fail", detail: r.error });
        }
      }
      continue;
    }

    if (!canSearch) {
      steps.push({ label: `源·${s.label}`, status: "skip", detail: "无联网后端" });
      continue;
    }
    const siteQuery = domain
      ? `${nameToken} ${domain} site content updates`
      : `${nameToken} ${s.label} ${s.url}`;
    const r = await generalWebSearch(siteQuery, 5);
    if (r.ok) {
      blocks.push(`### 自定义监控源：${s.label}（${s.url}）\n${r.text}`);
      steps.push({
        label: `源·${s.label}`,
        status: "ok",
        detail: siteQuery.slice(0, 120),
        preview: previewText(r.text),
      });
    } else {
      steps.push({ label: `源·${s.label}`, status: "fail", detail: r.error });
    }
  }

  if (enabledSources.length === 0 && dims.length === 0) {
    steps.push({ label: "监控源", status: "skip", detail: "无已启用自定义源" });
  }

  return { blocks, steps };
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
- 若结果含该公司官网页、LinkedIn 公司页、行业名录中的公司介绍，可记为 NEUTRAL 入库
- 若无新闻报道，可收录官网产品/服务/团队页面的公开信息摘要
- 公开信息较少时，只要有与该公司直接相关的一手公开内容就应收录，不要因条目少而返回空数组
只输出 JSON：{"items":[{"dimension","sentiment","title","summary","url","sourceName","publishedAt"}]}。最多 30 条，确实无任何相关内容则 items 为空数组。`;

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

  const hasEnabledSource = sources.some((s) => s.enabled);
  if (!dims.length && !hasEnabledSource) {
    return { ...empty, ok: true, error: "请先选择要监控的维度，或添加监控链接源" };
  }

  const canSearch = await isWebSearchAvailable();
  const searchBackend = await webSearchBackendLabel();
  const hasNp = hasNinjaPearKey() && !!(partner.website?.trim() || effectiveWebsite(partner, sources));
  if (dims.length && !canSearch && !(hasEnabledSource && hasNp)) {
    return {
      ...empty,
      needsWebSearch: true,
      searchBackend,
      error: "未找到支持联网搜索的已启用模型。请添加并启用 Kimi 或火山 web_search 配置。",
    };
  }

  const { blocks, steps } = await gatherViaModelSearch(partner, dims, sources);

  const raw = blocks.join("\n\n");
  const rawChars = raw.length;
  if (!raw.trim()) {
    steps.push({
      label: "AI 分类",
      status: "skip",
      detail: "无原始内容，跳过",
    });
    return {
      ...empty,
      ok: true,
      steps,
      searchBackend,
      rawChars: 0,
      error: "本次未抓取到公开信息（详见下方扫描日志）",
    };
  }

  const items = await classify(partner, dims, raw);
  steps.push({
    label: "AI 分类",
    status: items.length ? "ok" : "warn",
    detail: items.length
      ? `提炼 ${items.length} 条与该公司相关的舆情`
      : `未提炼出有效条目（原始 ${rawChars} 字，可能为噪声或公开信息过少）`,
    preview: items.length ? undefined : previewText(raw, 400),
  });

  // 去重：库内已有 + 本批内
  const existing = await db.monitorItem.findMany({
    where: { partnerId },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  const bySentiment: Record<string, number> = {};
  let created = 0;
  let skippedDup = 0;

  for (const it of items) {
    const key = dedupeKeyFor(it);
    if (seen.has(key)) {
      skippedDup++;
      continue;
    }
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

  steps.push({
    label: "去重入库",
    status: created > 0 ? "ok" : skippedDup > 0 ? "warn" : "warn",
    detail:
      created > 0
        ? `新增 ${created} 条${skippedDup ? `，跳过重复 ${skippedDup} 条` : ""}`
        : skippedDup > 0
          ? `${items.length} 条均已存在，无新增`
          : "无可入库条目",
  });

  return {
    ok: true,
    scanned: blocks.length,
    created,
    bySentiment,
    steps,
    classified: items.length,
    searchBackend,
    rawChars,
  };
}
