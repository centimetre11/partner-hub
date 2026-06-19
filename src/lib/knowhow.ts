import { db } from "./db";

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
  title: string;
  content: string;
  score: number | null;
  metadata: Record<string, unknown>;
};

export type KnowhowDocument = {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export async function resolveKnowhowCredential() {
  const stored = await db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } });
  const apiKey = stored?.apiKey?.trim() || process.env.KNOWHOW_API_KEY?.trim() || null;
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

function normalizeHit(raw: Record<string, unknown>): KnowhowSearchHit | null {
  const documentId = pickString(raw.document_id, raw.documentId, raw.id);
  if (!documentId) return null;
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const title = pickString(raw.title, raw.name, metadata.title, metadata.name, documentId);
  const content = pickString(raw.content, raw.text, raw.summary, raw.chunk, raw.snippet);
  return {
    documentId,
    title,
    content,
    score: pickNumber(raw.score, raw.final_score, raw.rerank_score, raw.vector_score),
    metadata,
  };
}

function extractHits(payload: unknown): KnowhowSearchHit[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const candidates = [root.data, root.results, root.records, root.items, root.documents, root.hits];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => (item && typeof item === "object" ? normalizeHit(item as Record<string, unknown>) : null))
        .filter((item): item is KnowhowSearchHit => !!item);
    }
  }
  if (Array.isArray(payload)) {
    return payload
      .map((item) => (item && typeof item === "object" ? normalizeHit(item as Record<string, unknown>) : null))
      .filter((item): item is KnowhowSearchHit => !!item);
  }
  return [];
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
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message)
        : typeof body === "string"
          ? body
          : res.statusText;
    throw new Error(`Know-how API ${res.status}: ${detail || "request failed"}`);
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

  return extractHits(payload);
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
  return {
    id,
    title: pickString(data.title, data.name, metadata.title, id),
    content: pickString(data.content, data.text, data.summary, data.body),
    metadata,
  };
}

export async function testKnowhowConnection(cred: { apiKey: string; baseUrl: string }) {
  const hits = await retrieveKnowhow(
    {
      query: "零售",
      retrieval_model: { top_k: 1, rerank_enable: false },
    },
    cred,
  );
  return {
    ok: true,
    count: hits.length,
    sampleTitle: hits[0]?.title ?? null,
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
      return `${i + 1}. [${h.title}] (doc: ${h.documentId})${score}${meta ? `\nMeta: ${meta}` : ""}\n${body || "(no snippet)"}`;
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
