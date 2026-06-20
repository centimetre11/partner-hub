const KNOWHOW_DEFAULT_BASE_URL = "https://digitchat.fanruan.com/dataset";
const KNOWHOW_SEARCH_ENTRY_BASE = "https://knowhow.fanruan.com";

function pickUrl(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  return "";
}

function isSyntheticDocumentId(id: string) {
  return id.startsWith("snippet-");
}

/** Know-how 数据集 API 拼出的文档页，不是 KH 平台搜索入口 */
export function isKnowhowDatasetDocumentUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (!/digitchat\.fanruan\.com/i.test(hostname)) return false;
    return /\/documents\/[^/]+/i.test(pathname);
  } catch {
    return false;
  }
}

function pickExternalUrl(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!/^https?:\/\//i.test(s)) continue;
    if (isKnowhowDatasetDocumentUrl(s)) continue;
    return s;
  }
  return "";
}

/** 从元数据提取 KH / KMS 等外部搜索入口（优先于通用 url 字段） */
function extractSearchEntryFromMetadata(metadata: Record<string, unknown>) {
  return pickExternalUrl(
    metadata.kh_url,
    metadata.kms_url,
    metadata.original_url,
    metadata.originalUrl,
    metadata.search_entry_url,
    metadata.entry_url,
    metadata.portal_url,
    metadata.url,
    metadata.web_url,
    metadata.source_url,
    metadata.link,
    metadata.document_url,
    metadata.file_url,
    metadata.page_url,
  );
}

/** 按文档标题构造 KH 平台搜索入口（非 digitchat 文档页） */
export function buildKnowhowSearchEntryUrl(title: string) {
  const q = title.trim();
  const base =
    process.env.KNOWHOW_SEARCH_ENTRY_BASE_URL?.trim() ||
    KNOWHOW_SEARCH_ENTRY_BASE;
  if (!q) return base.replace(/\/+$/, "");
  const root = base.replace(/\/+$/, "");
  const url = new URL(`${root}/search`);
  url.searchParams.set("query", q);
  return url.toString();
}

/** 构造 Know-how 文档 Web 页地址（仅内部调试；UI 跳转请用 resolveKnowhowSearchEntryUrl） */
export function buildKnowhowDocumentWebUrl(detailDocumentId: string, apiBaseUrl = KNOWHOW_DEFAULT_BASE_URL) {
  if (!detailDocumentId || isSyntheticDocumentId(detailDocumentId)) return "";
  const webBase =
    process.env.KNOWHOW_WEB_BASE_URL?.trim() ||
    apiBaseUrl.replace(/\/dataset\/?$/i, "").replace(/\/+$/, "") ||
    "https://digitchat.fanruan.com";
  return `${webBase.replace(/\/+$/, "")}/documents/${encodeURIComponent(detailDocumentId)}`;
}

export function resolveKnowhowSearchEntryUrl(hit: {
  title: string;
  sourceUrl?: string;
  detailDocumentId: string;
  metadata: Record<string, unknown>;
}): string {
  const fromMeta = extractSearchEntryFromMetadata(hit.metadata);
  if (fromMeta) return fromMeta;
  if (hit.sourceUrl && !isKnowhowDatasetDocumentUrl(hit.sourceUrl)) return hit.sourceUrl;
  return buildKnowhowSearchEntryUrl(hit.title);
}

/** @deprecated 使用 resolveKnowhowSearchEntryUrl */
export function resolveKnowhowSourceUrl(
  hit: {
    title: string;
    sourceUrl?: string;
    detailDocumentId: string;
    metadata: Record<string, unknown>;
  },
  _apiBaseUrl?: string,
): string {
  return resolveKnowhowSearchEntryUrl(hit);
}
