/** Sentiment monitoring core: web scan partner public info → AI classify dimension/sentiment → dedupe and store */

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
  /** Content preview summary (debug) */
  preview?: string;
};

export type ScanResult = {
  ok: boolean;
  error?: string;
  needsWebSearch?: boolean;
  scanned: number; // raw result blocks fetched
  created: number; // new items stored
  bySentiment: Record<string, number>;
  /** Scan process log (shown to user) */
  steps?: ScanStep[];
  /** Items classified by AI (before dedupe) */
  classified?: number;
  /** Web search backend in use */
  searchBackend?: string;
  /** Total raw character count */
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

/** Keep only valid dimensions; empty means empty (caller must specify explicitly, no default-all) */
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

/** Extract bare domain from website URL (strip www / protocol / path); empty on failure */
function hostFromWebsite(website: string | null | undefined): string {
  if (!website) return "";
  try {
    const h = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    return h.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Quote company name when it contains spaces for phrase anchoring */
function quoteName(name: string): string {
  const n = name.trim();
  return /\s/.test(n) ? `"${n}"` : n;
}

/** Strip non-ASCII (incl. Chinese) for non-Chinese-region partners to avoid CN noise */
function stripNonAscii(s: string): string {
  return s.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Chinese-region partner (only these keep mixed CN/EN keywords) */
function isChineseRegion(country: string | null | undefined): boolean {
  if (!country) return false;
  return /中国|中華|中国大陆|大陆|香港|台湾|澳门|china|prc|hong\s?kong|taiwan|macau|\bcn\b|\bhk\b|\btw\b/i.test(country);
}

/** Build search queries per dimension (non-Chinese regions use English-only keywords) */
export function buildDimensionQueries(
  partner: Pick<Partner, "name" | "country" | "city" | "website">,
  dims: string[],
): { dimension: string; query: string; topic?: "news" }[] {
  // Anchor with country + website domain; avoid Chinese city names (e.g. "Riyadh" in Chinese matches football club noise)
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

/** Infer website from enabled monitor source domains when profile has none */
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
    `Legal name: ${partner.name}`,
    partner.country ? `Country/region: ${partner.country}` : null,
    partner.website ? `Website: ${partner.website}` : null,
    host ? `Domain anchor: ${host}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

type GatherResult = { blocks: string[]; steps: ScanStep[] };

/** Gather raw results via model builtin web search + NinjaPear (step-by-step logging) */
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
    label: "Prepare",
    status: canSearch || hasNinjaPearKey() ? "ok" : "warn",
    detail: [
      canSearch ? `Web: ${backendLabel}` : "No web backend",
      `${dims.length} dimensions`,
      `${enabledSources.length} custom sources`,
    ].join(" · "),
  });

  const inferredWebsite = effectiveWebsite(partner, sources);
  const searchPartner =
    inferredWebsite && !partner.website?.trim() ? { ...partner, website: inferredWebsite } : partner;

  if (inferredWebsite && !partner.website?.trim()) {
    steps.push({
      label: "Infer website",
      status: "ok",
      detail: `No website on profile; inferred from monitor source: ${inferredWebsite}`,
    });
  }

  const ctxLine = searchContextLine(searchPartner);
  const dimQueries = buildDimensionQueries(searchPartner, dims);

  if (dimQueries.length && !canSearch) {
    steps.push({ label: "Dimension search", status: "skip", detail: "No web backend; skipped dimension searches" });
  }

  for (const { dimension, query, topic } of dimQueries) {
    const dimLabel = MONITOR_DIMENSION_LABELS[dimension];
    if (!canSearch) continue;

    const userQuery =
      `Search only for public information directly related to this partner; exclude unrelated same-name companies, irrelevant China domestic news, sports/entertainment noise.\n` +
      `${ctxLine}\nSearch focus: ${query}`;

    const r = await generalWebSearch(userQuery, 5, topic);
    if (r.ok) {
      blocks.push(`### [${dimLabel}] dimension search\n${r.text}`);
      steps.push({
        label: `Search·${dimLabel}`,
        status: "ok",
        detail: `Query: ${query.slice(0, 140)}${query.length > 140 ? "…" : ""}`,
        preview: previewText(r.text),
      });
    } else {
      steps.push({
        label: `Search·${dimLabel}`,
        status: "fail",
        detail: r.error,
      });
    }
  }

  // When per-dimension results are sparse, run one broad company search
  const dimRaw = blocks.filter((b) => b.includes("dimension search")).join("\n");
  if (canSearch && dims.length > 0 && dimRaw.length < 800) {
    const host = hostFromWebsite(searchPartner.website);
    const fallbackQ = `${quoteName(partner.name)} ${partner.country ?? ""} ${host} company profile news updates`;
    const r = await generalWebSearch(
      `Supplemental broad search: ${ctxLine}\nKeywords: ${fallbackQ}`,
      6,
    );
    if (r.ok && r.text.trim()) {
      blocks.push(`### Broad supplemental search\n${r.text}`);
      steps.push({
        label: "Supplement·broad search",
        status: "ok",
        detail: "Sparse dimension results; ran one broad company search",
        preview: previewText(r.text),
      });
    } else if (!r.ok) {
      steps.push({ label: "Supplement·broad search", status: "warn", detail: r.error });
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
            `### Custom monitor source: ${s.label} (${normalizeLinkedInCompanyUrl(s.url)})\n` +
              `Source: NinjaPear public company updates (website ${website})\n${np.text}`,
          );
          steps.push({
            label: `Source·${s.label}`,
            status: "ok",
            detail: `NinjaPear fetch by website ${website}`,
            preview: previewText(np.text),
          });
          continue;
        }
        steps.push({
          label: `Source·${s.label}`,
          status: "fail",
          detail: `NinjaPear: ${np.error}`,
        });
      } else if (!hasNinjaPearKey()) {
        steps.push({
          label: `Source·${s.label}`,
          status: "warn",
          detail: "NINJAPEARL_API_KEY not configured; cannot fetch by website",
        });
      } else if (!website) {
        steps.push({
          label: `Source·${s.label}`,
          status: "warn",
          detail: "No website on profile and cannot infer from monitor source; NinjaPear skipped",
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
          blocks.push(`### Custom monitor source: ${s.label} (${s.url})\n${r.text}`);
          steps.push({
            label: `Source·${s.label} (web)`,
            status: "ok",
            detail: `LinkedIn public page search: ${s.url}`,
            preview: previewText(r.text),
          });
        } else {
          steps.push({ label: `Source·${s.label} (web)`, status: "fail", detail: r.error });
        }
      }
      continue;
    }

    if (!canSearch) {
      steps.push({ label: `Source·${s.label}`, status: "skip", detail: "No web backend" });
      continue;
    }
    const siteQuery = domain
      ? `${nameToken} ${domain} site content updates`
      : `${nameToken} ${s.label} ${s.url}`;
    const r = await generalWebSearch(siteQuery, 5);
    if (r.ok) {
      blocks.push(`### Custom monitor source: ${s.label} (${s.url})\n${r.text}`);
      steps.push({
        label: `Source·${s.label}`,
        status: "ok",
        detail: siteQuery.slice(0, 120),
        preview: previewText(r.text),
      });
    } else {
      steps.push({ label: `Source·${s.label}`, status: "fail", detail: r.error });
    }
  }

  if (enabledSources.length === 0 && dims.length === 0) {
    steps.push({ label: "Monitor sources", status: "skip", detail: "No enabled custom sources" });
  }

  return { blocks, steps };
}

/** Use AI to structure raw results into sentiment items */
async function classify(
  partner: Pick<Partner, "name" | "country">,
  dims: string[],
  raw: string,
): Promise<ClassifiedItem[]> {
  const allowed = dims.length ? dims : MONITOR_DIMENSIONS;
  const dimList = allowed.map((d) => `${d}(${MONITOR_DIMENSION_LABELS[d]})`).join(", ");
  const system = `You are a Middle East partner sentiment analyst for BI vendor Fanruan. Below are raw web search results about partner "${partner.name}" (${partner.country ?? "Middle East"}).
Extract sentiment items **directly related** to this company; drop irrelevant, duplicate, or directory-only hits.
Reply in English for title and summary.
- dimension must be one of: ${dimList}
- sentiment: POSITIVE (opportunity), NEUTRAL, NEGATIVE, RISK (high-risk alert)
- title: one-line English headline; summary: 1-2 English sentences; url: source link; sourceName: site name; publishedAt: YYYY-MM-DD if known, else empty
- Official site pages, LinkedIn company pages, or directory profiles may be NEUTRAL
- If no news, public product/service/team page summaries are acceptable
- When public info is sparse, include any directly related first-party content; don't return empty just because there are few items
Output JSON only: {"items":[{"dimension","sentiment","title","summary","url","sourceName","publishedAt"}]}. Max 30 items; empty items array if nothing relevant.`;

  const { items } = await chatJson<{ items?: ClassifiedItem[] }>(system, raw.slice(0, MAX_RAW_CHARS), {
    feature: "Sentiment monitor classification",
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

/** Run one sentiment scan for a single partner */
export async function scanPartnerSentiment(
  partnerId: string,
  opts: { dims?: string[]; userId?: string | null; maxPerQuery?: number } = {},
): Promise<ScanResult> {
  const empty: ScanResult = { ok: false, scanned: 0, created: 0, bySentiment: {} };

  const hasAi =
    !!process.env.AI_API_KEY || (await db.aiApiConfig.count({ where: { enabled: true } })) > 0;
  if (!hasAi) {
    return { ...empty, error: "AI model not configured. Configure an AI API in Settings first." };
  }

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    include: { monitorSources: true },
  });
  if (!partner) return { ...empty, error: "Partner not found" };

  const dims = resolveDims(partner.monitorDims, opts.dims);
  const sources = partner.monitorSources;

  const hasEnabledSource = sources.some((s) => s.enabled);
  if (!dims.length && !hasEnabledSource) {
    return { ...empty, ok: true, error: "Select monitor dimensions or add monitor link sources first" };
  }

  const canSearch = await isWebSearchAvailable();
  const searchBackend = await webSearchBackendLabel();
  const hasNp = hasNinjaPearKey() && !!(partner.website?.trim() || effectiveWebsite(partner, sources));
  if (dims.length && !canSearch && !(hasEnabledSource && hasNp)) {
    return {
      ...empty,
      needsWebSearch: true,
      searchBackend,
      error: "No enabled model with web search found. Add and enable Kimi or Volcengine web_search config.",
    };
  }

  const { blocks, steps } = await gatherViaModelSearch(partner, dims, sources);

  const raw = blocks.join("\n\n");
  const rawChars = raw.length;
  if (!raw.trim()) {
    steps.push({
      label: "AI classification",
      status: "skip",
      detail: "No raw content; skipped",
    });
    return {
      ...empty,
      ok: true,
      steps,
      searchBackend,
      rawChars: 0,
      error: "No public information fetched this run (see scan log below)",
    };
  }

  const items = await classify(partner, dims, raw);
  steps.push({
    label: "AI classification",
    status: items.length ? "ok" : "warn",
    detail: items.length
      ? `Extracted ${items.length} company-related sentiment items`
      : `No valid items extracted (raw ${rawChars} chars — possible noise or sparse public info)`,
    preview: items.length ? undefined : previewText(raw, 400),
  });

  // Dedupe: existing in DB + within this batch
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
    label: "Dedupe & store",
    status: created > 0 ? "ok" : skippedDup > 0 ? "warn" : "warn",
    detail:
      created > 0
        ? `Added ${created}${skippedDup ? `, skipped ${skippedDup} duplicates` : ""}`
        : skippedDup > 0
          ? `All ${items.length} items already exist; nothing new`
          : "No items to store",
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
