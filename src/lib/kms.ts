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
  type?: string;
  title: string;
  space?: { name?: string; key?: string };
  version?: { when?: string; number?: number };
  body?: { storage?: { value?: string; representation?: string } };
  ancestors?: Array<{ id: string }>;
  _links?: { webui?: string; base?: string; tinyui?: string };
};

export type KmsWriteMode = "append" | "prepend" | "replace" | "create_child";

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

/** 纯文本 / 简单 Markdown → Confluence storage HTML */
export function plainTextToConfluenceStorage(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((li) => `<li><p>${escapeXml(li)}</p></li>`).join("")}</ul>`);
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${escapeXml(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushList();
    blocks.push(`<p>${escapeXml(trimmed)}</p>`);
  }
  flushList();
  return blocks.join("") || "<p></p>";
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mergeStorageBody(current: string, addition: string, mode: "append" | "prepend" | "replace") {
  if (mode === "replace") return addition;
  if (mode === "prepend") return `${addition}${current}`;
  return `${current}${addition}`;
}

async function fetchKmsContentRaw(opts: {
  baseUrl: string;
  token: string;
  pageId: string;
}): Promise<ConfluenceContent> {
  return kmsFetch<ConfluenceContent>(
    opts.baseUrl,
    opts.token,
    `/rest/api/content/${encodeURIComponent(opts.pageId)}?expand=body.storage,space,version,ancestors`
  );
}

export async function updateKmsPage(opts: {
  baseUrl: string;
  token: string;
  pageId: string;
  content: string;
  mode?: "append" | "prepend" | "replace";
  title?: string;
}): Promise<KmsPage> {
  const mode = opts.mode ?? "append";
  const current = await fetchKmsContentRaw(opts);
  const version = current.version?.number;
  if (!version) throw new Error("KMS page version missing — cannot update");

  const addition = plainTextToConfluenceStorage(opts.content);
  const existing = current.body?.storage?.value ?? "";
  const nextBody = mergeStorageBody(existing, addition, mode);

  const payload = {
    id: current.id,
    type: current.type ?? "page",
    title: opts.title?.trim() || current.title,
    version: { number: version + 1 },
    body: {
      storage: {
        value: nextBody,
        representation: "storage",
      },
    },
  };

  const updated = await kmsFetch<ConfluenceContent>(
    opts.baseUrl,
    opts.token,
    `/rest/api/content/${encodeURIComponent(opts.pageId)}`,
    { method: "PUT", body: payload },
  );
  return toKmsPage(opts.baseUrl, updated);
}

export async function createKmsChildPage(opts: {
  baseUrl: string;
  token: string;
  parentPageId: string;
  title: string;
  content: string;
}): Promise<KmsPage> {
  const parent = await fetchKmsContentRaw({
    baseUrl: opts.baseUrl,
    token: opts.token,
    pageId: opts.parentPageId,
  });
  const spaceKey = parent.space?.key;
  if (!spaceKey) throw new Error("Parent page has no space key — cannot create child page");

  const created = await kmsFetch<ConfluenceContent>(opts.baseUrl, opts.token, "/rest/api/content", {
    method: "POST",
    body: {
      type: "page",
      title: opts.title.trim(),
      space: { key: spaceKey },
      ancestors: [{ id: opts.parentPageId }],
      body: {
        storage: {
          value: plainTextToConfluenceStorage(opts.content),
          representation: "storage",
        },
      },
    },
  });
  return toKmsPage(opts.baseUrl, created);
}

export async function writeKmsForUser(
  userId: string | null | undefined,
  args: {
    pageId?: string;
    url?: string;
    content: string;
    mode?: KmsWriteMode;
    title?: string;
  },
): Promise<string> {
  const cred = await getUserKmsCredential(userId);
  if (!cred?.accessToken) {
    return "KMS personal access token is not configured. After signing in, enter it once under Team Settings → KMS document access; the Agent and assistant will use it automatically.";
  }

  const content = String(args.content ?? "").trim();
  if (!content) return "content is required";

  const rawInput = args.pageId ? String(args.pageId) : args.url ? String(args.url) : null;
  if (!rawInput) return "Provide pageId or url of the target KMS page.";

  const mode = (args.mode ?? "append") as KmsWriteMode;
  if (!["append", "prepend", "replace", "create_child"].includes(mode)) {
    return "mode must be one of: append, prepend, replace, create_child";
  }

  try {
    const pageId = parseKmsPageId(rawInput);
    const resolvedId = pageId
      ? pageId
      : (await fetchKmsPageFromUrl({ baseUrl: cred.baseUrl, token: cred.accessToken, url: rawInput })).id;

    if (mode === "create_child") {
      const title = String(args.title ?? "").trim();
      if (!title) return "title is required when mode=create_child";
      const page = await createKmsChildPage({
        baseUrl: cred.baseUrl,
        token: cred.accessToken,
        parentPageId: resolvedId,
        title,
        content,
      });
      return `Created child page: [${page.title}]\nLink: ${page.webUrl}\n\n${page.plainText.slice(0, 500)}`;
    }

    const page = await updateKmsPage({
      baseUrl: cred.baseUrl,
      token: cred.accessToken,
      pageId: resolvedId,
      content,
      mode,
      title: args.title ? String(args.title) : undefined,
    });
    return `Updated KMS page (${mode}): [${page.title}]\nLink: ${page.webUrl}\nUpdated: ${page.updatedAt ?? "now"}\n\nPreview:\n${page.plainText.slice(0, 800)}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function kmsFetch<T>(
  baseUrl: string,
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`KMS authentication failed (${res.status}): personal access token is invalid, expired, or lacks write permission. Reconfigure it in team settings.`);
    }
    if (res.status === 404) {
      throw new Error(`KMS page not found (404): ${path}`);
    }
    if (res.status === 409) {
      throw new Error(`KMS write conflict (409): page was updated by someone else. Re-read and retry. ${errText}`);
    }
    throw new Error(`KMS request failed (${res.status}): ${errText}`);
  }
  if (res.status === 204) return undefined as T;
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
