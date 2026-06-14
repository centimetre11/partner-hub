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

/** Confluence storage HTML/XHTML → 纯文本 */
export function confluenceStorageToPlainText(storage: string, maxLen = 12000): string {
  let text = storage
    .replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/gi, "")
    .replace(/<ac:image[\s\S]*?<\/ac:image>/gi, "[图片]")
    .replace(/<ri:attachment[^>]*\/>/gi, "[附件]")
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
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}…（已截断）`;
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
      throw new Error(`KMS 认证失败（${res.status}）：个人访问令牌无效或已过期，请在团队设置中重新配置。`);
    }
    if (res.status === 404) {
      throw new Error(`KMS 页面不存在（404）：${path}`);
    }
    throw new Error(`KMS 请求失败（${res.status}）：${errText}`);
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
    plainText: plain || "（页面无正文）",
    updatedAt: data.version?.when,
  };
}

export async function getUserKmsCredential(userId: string | null | undefined) {
  if (!userId) return null;
  return db.userKmsCredential.findUnique({ where: { userId } });
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
    return "未配置 KMS 个人访问令牌。请登录后在「团队设置 → KMS 文档访问」中填写一次，之后 Agent 与助手将自动使用。";
  }

  try {
    const pageId = args.pageId
      ? parseKmsPageId(args.pageId)
      : args.url
        ? parseKmsPageId(args.url)
        : null;

    if (pageId) {
      const page = await fetchKmsPageById({
        baseUrl: cred.baseUrl,
        token: cred.accessToken,
        pageId,
      });
      return formatKmsPage(page);
    }

    if (args.query?.trim()) {
      const pages = await searchKmsPages({
        baseUrl: cred.baseUrl,
        token: cred.accessToken,
        query: args.query,
        limit: args.limit ?? 5,
      });
      if (!pages.length) return `KMS 中未找到与「${args.query}」相关的页面`;
      return pages
        .map((p, i) => `${i + 1}. ${formatKmsPage(p, true)}`)
        .join("\n\n---\n\n");
    }

    return "请提供 pageId、url 或 query 之一。例：pageId=1420741418，或 query=\"FineBI 中东\"";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function formatKmsPage(page: KmsPage, excerpt = false) {
  const meta = [`【${page.title}】`, `空间：${page.spaceName || page.spaceKey || "-"}`, `链接：${page.webUrl}`];
  if (page.updatedAt) meta.push(`更新：${page.updatedAt}`);
  const body = excerpt ? page.plainText.slice(0, 1200) : page.plainText;
  return `${meta.join("\n")}\n\n${body}`;
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
