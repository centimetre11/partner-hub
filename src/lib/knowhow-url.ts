const KNOWHOW_DEFAULT_BASE_URL = "https://digitchat.fanruan.com/dataset";

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

function extractSourceUrlFromMetadata(metadata: Record<string, unknown>) {
  return pickUrl(
    metadata.url,
    metadata.web_url,
    metadata.source_url,
    metadata.link,
    metadata.document_url,
    metadata.file_url,
    metadata.page_url,
    metadata.kh_url,
    metadata.kms_url,
    metadata.original_url,
    metadata.originalUrl,
  );
}

/** 构造 Know-how 文档 Web 页地址（可通过 KNOWHOW_WEB_BASE_URL 覆盖） */
export function buildKnowhowDocumentWebUrl(detailDocumentId: string, apiBaseUrl = KNOWHOW_DEFAULT_BASE_URL) {
  if (!detailDocumentId || isSyntheticDocumentId(detailDocumentId)) return "";
  const webBase =
    process.env.KNOWHOW_WEB_BASE_URL?.trim() ||
    apiBaseUrl.replace(/\/dataset\/?$/i, "").replace(/\/+$/, "") ||
    "https://digitchat.fanruan.com";
  return `${webBase.replace(/\/+$/, "")}/documents/${encodeURIComponent(detailDocumentId)}`;
}

export function resolveKnowhowSourceUrl(
  hit: {
    sourceUrl?: string;
    detailDocumentId: string;
    metadata: Record<string, unknown>;
  },
  apiBaseUrl?: string,
): string {
  if (hit.sourceUrl) return hit.sourceUrl;
  const fromMeta = extractSourceUrlFromMetadata(hit.metadata);
  if (fromMeta) return fromMeta;
  return buildKnowhowDocumentWebUrl(hit.detailDocumentId, apiBaseUrl);
}
