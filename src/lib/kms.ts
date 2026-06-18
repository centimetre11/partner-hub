import { db } from "./db";

export const KMS_DEFAULT_BASE_URL = "https://kms.fineres.com";

export type KmsPage = {
  id: string;
  title: string;
  spaceName: string;
  spaceKey: string;
  webUrl: string;
  plainText: string;
  updatedAt?: string;
};

type ConfluenceContent = {
  id: string;
  title: string;
  space?: { name?: string; key?: string };
  version?: { when?: string; number?: number };
  body?: { storage?: { value?: string } };
  _links?: { webui?: string; base?: string; tinyui?: string };
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function parseKmsPageId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const fromQuery = trimmed.match(/[?&]pageId=(\d+)/i)?.[1];
  if (fromQuery) return fromQuery;
  const fromPath = trimmed.match(/\/pages\/(\d+)/i)?.[1];
  if (fromPath) return fromPath;
  return null;
}

/** Confluence 友好 URL：/display/{spaceKey}/{pageTitle} */
export function parseKmsDisplayUrl(input: string): { spaceKey: string; title: string } | null {
  const trimmed = input.trim();
  const m = trimmed.match(/\/display\/([^/?#]+)\/([^?#]+)/i);
  if (!m) return null;
  const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " "));
  return { spaceKey: decode(m[1]), title: decode(m[2]) };
}

/** 从用户文本中提取所有 KMS 链接 */
export function extractKmsUrls(text: string): string[] {
  const re = /https?:\/\/kms\.fineres\.com[^\s)\]>"'，。；、]+/gi;
  return [...new Set((text.match(re) ?? []).map((u) => u.replace(/[.,;，。；、]+$/, "")))];
}

/** Confluence storage HTML/XHTML → 纯文本 */
export function confluenceStorageToPlainText(storage: string, maxLen = 12000): string {
  let text = storage
    .replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/gi, "")
    .replace(/<ac:image[\s\S]*?<\/ac:image>/gi, "[image]")
    .replace(/<ri:attachment[^>]*\/>/gi, "[attachment]")
    .replace(/<h([1-6])[^>]*>/gi, "\n\n## ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}… (truncated)`;
  return text;
}

async function kmsFetch<T>(baseUrl: string, token: string, path: string): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`KMS authentication failed (${res.status}): personal access token is invalid or expired. Reconfigure it in team settings.`);
    }
    if (res.status === 404) {
      throw new Error(`KMS page not found (404): ${path}`);
    }
    throw new Error(`KMS request failed (${res.status}): ${errText}`);
  }
  return res.json() as Promise<T>;
}

function toKmsPage(baseUrl: string, data: ConfluenceContent): KmsPage {
  const base = normalizeBaseUrl(baseUrl);
  const webPath = data._links?.webui ?? `/pages/viewpage.action?pageId=${data.id}`;
  const plain = confluenceStorageToPlainText(data.body?.storage?.value ?? "");
  return {
    id: data.id,
    title: data.title,
    spaceName: data.space?.name ?? "",
    spaceKey: data.space?.key ?? "",
    webUrl: `${base}${webPath.startsWith("/") ? webPath : `/${webPath}`}`,
    plainText: plain || "(page has no body)",
    updatedAt: data.version?.when,
  };
}

export async function getUserKmsCredential(userId: string | null | undefined) {
  if (!userId) return null;
  return db.userKmsCredential.findUnique({ where: { userId } });
}

export async function isKmsConfiguredForUser(userId: string | null | undefined): Promise<boolean> {
  const cred = await getUserKmsCredential(userId);
  return !!cred?.accessToken;
}

export async function fetchKmsPageById(opts: {
  baseUrl: string;
  token: string;
  pageId: string;
}): Promise<KmsPage> {
  const data = await kmsFetch<ConfluenceContent>(
    opts.baseUrl,
    opts.token,
    `/rest/api/content/${encodeURIComponent(opts.pageId)}?expand=body.storage,space,version`
  );
  return toKmsPage(opts.baseUrl, data);
}

export async function fetchKmsPageBySpaceTitle(opts: {
  baseUrl: string;
  token: string;
  spaceKey: string;
  title: string;
}): Promise<KmsPage> {
  const params = new URLSearchParams({
    spaceKey: opts.spaceKey,
    title: opts.title,
    expand: "body.storage,space,version",
  });
  const data = await kmsFetch<{ results?: ConfluenceContent[]; size?: number }>(
    opts.baseUrl,
    opts.token,
    `/rest/api/content?${params}`
  );
  const hit = data.results?.[0];
  if (!hit) {
    throw new Error(`KMS page not found in space "${opts.spaceKey}" with title "${opts.title}"`);
  }
  return toKmsPage(opts.baseUrl, hit);
}

/** 统一解析 pageId / viewpage URL / display URL */
export async function fetchKmsPageFromUrl(opts: {
  baseUrl: string;
  token: string;
  url: string;
}): Promise<KmsPage> {
  const pageId = parseKmsPageId(opts.url);
  if (pageId) {
    return fetchKmsPageById({ baseUrl: opts.baseUrl, token: opts.token, pageId });
  }
  const display = parseKmsDisplayUrl(opts.url);
  if (display) {
    try {
      return await fetchKmsPageBySpaceTitle({ baseUrl: opts.baseUrl, token: opts.token, ...display });
    } catch {
      // display URL 标题可能与实际页面略有出入（如 AI vs Al），按空间内搜索兜底
      const hits = await searchKmsPages({
        baseUrl: opts.baseUrl,
        token: opts.token,
        query: display.title,
        limit: 5,
      });
      const inSpace = hits.filter((p) => p.spaceKey === display.spaceKey);
      const pool = inSpace.length ? inSpace : hits;
      if (!pool.length) {
        throw new Error(`KMS page not found for URL: ${opts.url}`);
      }
      return pool[0];
    }
  }
  throw new Error(`Unrecognized KMS URL: ${opts.url}`);
}

export async function searchKmsPages(opts: {
  baseUrl: string;
  token: string;
  query: string;
  limit?: number;
}): Promise<KmsPage[]> {
  const q = opts.query.trim();
  if (!q) return [];
  const cql = `text ~ "${q.replace(/"/g, '\\"')}" AND type=page`;
  const params = new URLSearchParams({
    cql,
    limit: String(opts.limit ?? 5),
    expand: "body.storage,space,version",
  });
  const data = await kmsFetch<{ results?: ConfluenceContent[] }>(
    opts.baseUrl,
    opts.token,
    `/rest/api/content/search?${params}`
  );
  return (data.results ?? []).map((item) => toKmsPage(opts.baseUrl, item));
}

export async function readKmsForUser(
  userId: string | null | undefined,
  args: { pageId?: string; url?: string; query?: string; limit?: number }
): Promise<string> {
  const cred = await getUserKmsCredential(userId);
  if (!cred?.accessToken) {
    return "KMS personal access token is not configured. After signing in, enter it once under Team Settings → KMS document access; the Agent and assistant will use it automatically.";
  }

  try {
    const rawInput = args.pageId ? String(args.pageId) : args.url ? String(args.url) : null;

    if (rawInput) {
      const pageId = parseKmsPageId(rawInput);
      const page = pageId
        ? await fetchKmsPageById({ baseUrl: cred.baseUrl, token: cred.accessToken, pageId })
        : await fetchKmsPageFromUrl({ baseUrl: cred.baseUrl, token: cred.accessToken, url: rawInput });
      return formatKmsPage(page);
    }

    if (args.query?.trim()) {
      const pages = await searchKmsPages({
        baseUrl: cred.baseUrl,
        token: cred.accessToken,
        query: args.query,
        limit: args.limit ?? 5,
      });
      if (!pages.length) return `No KMS pages found related to "${args.query}"`;
      return pages
        .map((p, i) => `${i + 1}. ${formatKmsPage(p, true)}`)
        .join("\n\n---\n\n");
    }

    return "Provide one of pageId, url, or query. Example: pageId=1420741418, or query=\"FineBI Middle East\"";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function formatKmsPage(page: KmsPage, excerpt = false) {
  const meta = [`[${page.title}]`, `Space: ${page.spaceName || page.spaceKey || "-"}`, `Link: ${page.webUrl}`];
  if (page.updatedAt) meta.push(`Updated: ${page.updatedAt}`);
  const body = excerpt ? page.plainText.slice(0, 1200) : page.plainText;
  return `${meta.join("\n")}\n\n${body}`;
}

/** 建档前自动预读用户消息里的 KMS 链接（不依赖模型是否调用 read_kms） */
export async function prefetchKmsFromText(
  userId: string | null | undefined,
  text: string,
): Promise<{ ok: true; content: string; urls: string[] } | { ok: false; reason: "not_configured" | "no_urls" }> {
  const cred = await getUserKmsCredential(userId);
  if (!cred?.accessToken) return { ok: false, reason: "not_configured" };

  const urls = extractKmsUrls(text);
  if (!urls.length) return { ok: false, reason: "no_urls" };

  const parts: string[] = [];
  for (const url of urls) {
    try {
      const page = await fetchKmsPageFromUrl({
        baseUrl: cred.baseUrl,
        token: cred.accessToken,
        url,
      });
      parts.push(formatKmsPage(page));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      parts.push(`[Failed: ${url}]\n${msg}`);
    }
  }

  return { ok: true, content: parts.join("\n\n---\n\n"), urls };
}

/** 连通性测试（默认测试页 1420741418） */
export async function testKmsConnection(opts: {
  baseUrl?: string;
  token: string;
  testPageId?: string;
}) {
  const baseUrl = opts.baseUrl?.trim() || KMS_DEFAULT_BASE_URL;
  const pageId = opts.testPageId ?? "1420741418";
  const page = await fetchKmsPageById({ baseUrl, token: opts.token, pageId });
  return {
    ok: true as const,
    title: page.title,
    spaceName: page.spaceName,
    preview: page.plainText.slice(0, 200),
  };
}
