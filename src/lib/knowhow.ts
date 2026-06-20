import { db } from "./db";
import { normalizeKnowhowApiKey } from "./knowhow-token";
import { resolveKnowhowSearchEntryUrl } from "./knowhow-url";

export { normalizeKnowhowApiKey } from "./knowhow-token";
export {
  buildKnowhowDocumentWebUrl,
  buildKnowhowSearchEntryUrl,
  isKnowhowDatasetDocumentUrl,
  resolveKnowhowSearchEntryUrl,
  resolveKnowhowSourceUrl,
} from "./knowhow-url";

export const KNOWHOW_DEFAULT_BASE_URL = "https://digitchat.fanruan.com/dataset";

export type KnowhowFilterOperator =
  | "equals"
  | "containsAny"
  | "in"
  | "gte"
  | "lte"
  | "gt"
  | "lt";

export type KnowhowMetadataFilter = {
  value: string | string[] | number;
  operator: KnowhowFilterOperator;
};

export type KnowhowRetrievalModel = {
  business_domain?: "project" | "contract";
  datasets?: "summary" | "chunk" | "both";
  rerank_enable?: boolean;
  top_k?: number;
  score_threshold?: number | null;
  vector_weight?: number | null;
  rerank_blend_weight?: number | null;
};

export type KnowhowRetrieveRequest = {
  query: string;
  retrieval_model?: KnowhowRetrievalModel;
  metadata_filters?: Record<string, KnowhowMetadataFilter>;
};

export type KnowhowSearchHit = {
  documentId: string;
  /** 用于 GET /documents/{id} 的 ID（优先 metadata.document_id） */
  detailDocumentId: string;
  title: string;
  content: string;
  score: number | null;
  sourceUrl: string;
  metadata: Record<string, unknown>;
};

export type KnowhowDocument = {
  id: string;
  title: string;
  content: string;
  sourceUrl: string;
  metadata: Record<string, unknown>;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export async function resolveKnowhowCredential() {
  const stored = await db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } });
  const rawKey = stored?.apiKey?.trim() || process.env.KNOWHOW_API_KEY?.trim() || "";
  const apiKey = rawKey ? normalizeKnowhowApiKey(rawKey) : null;
  const baseUrl = stored?.baseUrl?.trim() || process.env.KNOWHOW_BASE_URL?.trim() || KNOWHOW_DEFAULT_BASE_URL;
  return apiKey ? { apiKey, baseUrl: normalizeBaseUrl(baseUrl) } : null;
}

export async function getKnowhowConfigStatus() {
  const cred = await resolveKnowhowCredential();
  const stored = await db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } });
  return {
    configured: !!cred,
    keyTail: stored?.apiKey ? stored.apiKey.slice(-4) : process.env.KNOWHOW_API_KEY ? "env" : "",
    baseUrl: stored?.baseUrl ?? KNOWHOW_DEFAULT_BASE_URL,
    source: stored?.apiKey ? "system" : process.env.KNOWHOW_API_KEY ? "env" : null,
  };
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function pickUrl(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  return "";
}

export function resolveDetailDocumentId(metadata: Record<string, unknown>, fallback: string) {
  const fromMeta = pickString(metadata.document_id, metadata.documentId, metadata.doc_id, metadata.id);
  if (fromMeta && !fromMeta.startsWith("snippet-")) return fromMeta;
  if (fallback && !fallback.startsWith("snippet-")) return fallback;
  return fromMeta || fallback;
}

function isSyntheticDocumentId(id: string) {
  return id.startsWith("snippet-");
}

function extractSourceUrl(
  raw: Record<string, unknown>,
  metadata: Record<string, unknown>,
  document?: Record<string, unknown> | null,
) {
  return pickUrl(
    metadata.kh_url,
    metadata.kms_url,
    metadata.original_url,
    metadata.originalUrl,
    metadata.search_entry_url,
    metadata.entry_url,
    metadata.portal_url,
    raw.url,
    raw.web_url,
    raw.source_url,
    raw.link,
    raw.document_url,
    raw.file_url,
    document?.url,
    document?.web_url,
    document?.source_url,
    metadata.url,
    metadata.web_url,
    metadata.source_url,
    metadata.link,
    metadata.document_url,
    metadata.file_url,
    metadata.page_url,
  );
}

function normalizeHit(raw: Record<string, unknown>): KnowhowSearchHit | null {
  const segment =
    raw.segment && typeof raw.segment === "object" && !Array.isArray(raw.segment)
      ? (raw.segment as Record<string, unknown>)
      : null;
  const document =
    (segment?.document && typeof segment.document === "object" && !Array.isArray(segment.document)
      ? (segment.document as Record<string, unknown>)
      : null) ??
    (raw.document && typeof raw.document === "object" && !Array.isArray(raw.document)
      ? (raw.document as Record<string, unknown>)
      : null);

  const documentId =
    pickString(
      raw.document_id,
      raw.documentId,
      raw.chunk_id,
      raw.chunkId,
      raw.record_id,
      raw.recordId,
      segment?.document_id,
      segment?.documentId,
      segment?.id,
      segment?.chunk_id,
      document?.id,
      document?.document_id,
      raw.id,
    ) || "";
  const content = pickString(
    raw.content,
    raw.text,
    raw.summary,
    raw.chunk,
    raw.snippet,
    raw.page_content,
    raw.pageContent,
    segment?.content,
    segment?.text,
    segment?.summary,
    segment?.chunk,
    segment?.snippet,
    segment?.page_content,
  );
  if (!documentId && !content) return null;
  const resolvedId =
    documentId ||
    pickString(raw.id, segment?.id) ||
    `snippet-${content.slice(0, 32).replace(/\s+/g, " ").trim()}`;

  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : segment?.metadata && typeof segment.metadata === "object" && !Array.isArray(segment.metadata)
        ? (segment.metadata as Record<string, unknown>)
        : document?.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
          ? (document.metadata as Record<string, unknown>)
          : {};

  const title = pickString(
    raw.title,
    raw.name,
    document?.name,
    document?.title,
    metadata.title,
    metadata.name,
    segment?.title,
    resolvedId,
  );
  const sourceUrl = extractSourceUrl(raw, metadata, document);
  const detailDocumentId = resolveDetailDocumentId(metadata, resolvedId);
  return {
    documentId: resolvedId,
    detailDocumentId,
    title,
    content,
    score: pickNumber(raw.score, raw.final_score, raw.rerank_score, raw.vector_score),
    sourceUrl,
    metadata,
  };
}

function collectHitArrays(value: unknown, depth = 0): Record<string, unknown>[][] {
  if (depth > 4 || value == null) return [];
  if (Array.isArray(value)) {
    const objects = value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
    if (objects.length && objects.some((item) => normalizeHit(item))) return [objects];
    return objects.flatMap((item) => collectHitArrays(item, depth + 1));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const arrays: Record<string, unknown>[][] = [];
    for (const key of [
      "records",
      "results",
      "data",
      "items",
      "documents",
      "hits",
      "chunks",
      "retrieval_results",
      "segments",
    ]) {
      if (key in obj) arrays.push(...collectHitArrays(obj[key], depth + 1));
    }
    return arrays;
  }
  return [];
}

function extractHits(payload: unknown): KnowhowSearchHit[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) {
    const direct = root.data
      .map((item) => (item && typeof item === "object" ? normalizeHit(item as Record<string, unknown>) : null))
      .filter((item): item is KnowhowSearchHit => !!item);
    if (direct.length) return direct;
  }
  const arrays = collectHitArrays(payload);
  for (const candidate of arrays) {
    const hits = candidate
      .map((item) => normalizeHit(item))
      .filter((item): item is KnowhowSearchHit => !!item);
    if (hits.length) return hits;
  }
  return [];
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return String(payload).slice(0, 500);
  const root = payload as Record<string, unknown>;
  const keys = Object.keys(root);
  const preview: Record<string, unknown> = { keys };
  for (const key of keys.slice(0, 8)) {
    const val = root[key];
    if (Array.isArray(val)) preview[key] = `array(${val.length})`;
    else if (val && typeof val === "object") preview[key] = `object(${Object.keys(val as object).join(",")})`;
    else preview[key] = val;
  }
  return JSON.stringify(preview);
}

async function knowhowFetch<T>(
  cred: { apiKey: string; baseUrl: string },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${cred.baseUrl}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cred.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : body && typeof body === "object" && "message" in body
          ? String((body as { message?: unknown }).message)
          : typeof body === "string"
            ? body
            : res.statusText;
    throw new Error(`Know-how API ${res.status}: ${detail || "request failed"}`);
  }
  if (body && typeof body === "object" && "detail" in body) {
    throw new Error(`Know-how API: ${String((body as { detail?: unknown }).detail)}`);
  }
  return body as T;
}

export async function retrieveKnowhow(
  request: KnowhowRetrieveRequest,
  credOverride?: { apiKey: string; baseUrl: string },
): Promise<KnowhowSearchHit[]> {
  const cred = credOverride ?? (await resolveKnowhowCredential());
  if (!cred) throw new Error("Know-how API token not configured");

  const payload = await knowhowFetch<unknown>(cred, "api/v1/retrieve", {
    method: "POST",
    body: JSON.stringify({
      query: request.query,
      retrieval_model: {
        business_domain: "project",
        datasets: "both",
        rerank_enable: true,
        top_k: 20,
        vector_weight: 0.7,
        rerank_blend_weight: 0.3,
        ...request.retrieval_model,
      },
      ...(request.metadata_filters ? { metadata_filters: request.metadata_filters } : {}),
    }),
  });

  const hits = extractHits(payload).map((hit) => ({
    ...hit,
    sourceUrl: resolveKnowhowSearchEntryUrl(hit),
  }));
  if (!hits.length) {
    console.warn("[knowhow] retrieve returned 0 parsed hits", {
      query: request.query,
      baseUrl: cred.baseUrl,
      summary: summarizePayload(payload),
    });
  }
  return hits;
}

export async function getKnowhowDocument(
  documentId: string,
  credOverride?: { apiKey: string; baseUrl: string },
): Promise<KnowhowDocument> {
  const cred = credOverride ?? (await resolveKnowhowCredential());
  if (!cred) throw new Error("Know-how API token not configured");

  const payload = await knowhowFetch<Record<string, unknown>>(
    cred,
    `api/v1/datasets/documents/${encodeURIComponent(documentId)}`,
    { method: "GET" },
  );
  const data =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : payload;
  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const id = pickString(data.id, data.document_id, documentId);
  const sourceUrl = extractSourceUrl(data, metadata);
  return {
    id,
    title: pickString(data.title, data.name, metadata.title, metadata.name, id),
    content: pickString(
      data.content,
      data.text,
      data.summary,
      data.body,
      data.full_text,
      data.fullText,
      metadata.content,
      metadata.summary,
      metadata.text,
    ),
    sourceUrl,
    metadata,
  };
}

/** 拉取文档详情；若 API 无正文则回退到检索摘要 */
export async function getKnowhowDocumentDetail(
  hit: KnowhowSearchHit,
  credOverride?: { apiKey: string; baseUrl: string },
): Promise<KnowhowDocument & { fromSearchFallback?: boolean; apiError?: string }> {
  const fallback: KnowhowDocument = {
    id: hit.detailDocumentId,
    title: hit.title,
    content: hit.content,
    sourceUrl: resolveKnowhowSearchEntryUrl(hit),
    metadata: hit.metadata,
  };

  if (isSyntheticDocumentId(hit.detailDocumentId)) {
    return { ...fallback, fromSearchFallback: true };
  }

  try {
    const doc = await getKnowhowDocument(hit.detailDocumentId, credOverride);
    return {
      id: doc.id,
      title: doc.title || hit.title,
      content: doc.content || hit.content,
      sourceUrl: resolveKnowhowSearchEntryUrl({ ...hit, sourceUrl: doc.sourceUrl || hit.sourceUrl }),
      metadata: { ...hit.metadata, ...doc.metadata },
      fromSearchFallback: !doc.content && !!hit.content,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...fallback, fromSearchFallback: true, apiError: message };
  }
}

export async function testKnowhowConnection(cred: { apiKey: string; baseUrl: string }) {
  const normalized = { ...cred, apiKey: normalizeKnowhowApiKey(cred.apiKey) };
  const payload = await knowhowFetch<unknown>(normalized, "api/v1/retrieve", {
    method: "POST",
    body: JSON.stringify({
      query: "零售行业的成功案例有哪些？",
      retrieval_model: {
        business_domain: "project",
        datasets: "both",
        rerank_enable: true,
        top_k: 5,
        vector_weight: 0.7,
        rerank_blend_weight: 0.3,
      },
    }),
  });
  const hits = extractHits(payload);
  return {
    ok: true,
    count: hits.length,
    sampleTitle: hits[0]?.title ?? null,
    keyLength: normalized.apiKey.length,
    keyTail: normalized.apiKey.slice(-4),
    rawSummary: summarizePayload(payload),
  };
}

function splitCsv(raw: unknown) {
  return String(raw ?? "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildAgentFilters(args: Record<string, unknown>) {
  const filters: Record<string, KnowhowMetadataFilter> = {};
  const tags = Array.isArray(args.tags) ? args.tags.map(String) : splitCsv(args.tags);
  if (tags.length) filters.tags = { value: tags, operator: "containsAny" };
  if (args.quality) filters.quality = { value: String(args.quality), operator: "equals" };
  const nodePath = Array.isArray(args.node_path)
    ? args.node_path.map(String)
    : splitCsv(args.node_path);
  if (nodePath.length) filters.node_path = { value: nodePath, operator: "containsAny" };
  const industry = Array.isArray(args.industry) ? args.industry.map(String) : splitCsv(args.industry);
  if (industry.length) filters.industry = { value: industry, operator: "containsAny" };
  if (args.author) filters.author = { value: String(args.author), operator: "equals" };
  if (args.customer) filters.customer = { value: String(args.customer), operator: "equals" };
  return Object.keys(filters).length ? filters : undefined;
}

export function formatKnowhowHitsForAgent(hits: KnowhowSearchHit[]): string {
  if (!hits.length) return "No Know-how results found";
  return hits
    .map((h, i) => {
      const meta = Object.entries(h.metadata)
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
        .join("; ");
      const score = h.score != null ? ` score=${h.score.toFixed(3)}` : "";
      const body = h.content.slice(0, 1200) + (h.content.length > 1200 ? "…" : "");
      return `${i + 1}. [${h.title}] (doc: ${h.detailDocumentId})${score}${meta ? `\nMeta: ${meta}` : ""}${h.sourceUrl ? `\nURL: ${h.sourceUrl}` : ""}\n${body || "(no snippet)"}`;
    })
    .join("\n\n---\n\n");
}

export async function searchKnowhowForAgent(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? "").trim();
  if (!query) return "Please provide a Know-how search query";

  const cred = await resolveKnowhowCredential();
  if (!cred) {
    return "Know-how search is not configured. Ask a team admin to set the API token in Team Settings.";
  }

  const hits = await retrieveKnowhow({
    query,
    retrieval_model: {
      business_domain: args.business_domain === "contract" ? "contract" : "project",
      datasets: "both",
      rerank_enable: true,
      top_k: Math.min(Math.max(Number(args.top_k) || 10, 1), 50),
      vector_weight: 0.7,
      rerank_blend_weight: 0.3,
    },
    metadata_filters: buildAgentFilters(args),
  });

  if (!hits.length) return `No Know-how results for "${query}"`;
  return formatKnowhowHitsForAgent(hits);
}

export async function isKnowhowConfigured() {
  return !!(await resolveKnowhowCredential());
}
