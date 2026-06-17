/**
 * NinjaPear API（原 Proxycurl 团队的新产品）
 * 文档：https://nubela.co/docs
 *
 * 注意：Proxycurl 的 LinkedIn 抓取接口已下线；NinjaPear 按公司官网抓取博客 / X 等公开更新，不直接抓 LinkedIn posts。
 */

export type NinjaPearUpdate = {
  url?: string;
  title?: string;
  description?: string;
  image_url?: string | null;
  timestamp?: string | null;
  source?: string;
};

export type NinjaPearUpdatesResponse = {
  blogs?: string[];
  x_profile?: string | null;
  youtube_channels?: string[];
  updates?: NinjaPearUpdate[];
  timestamp?: string;
  error?: string;
};

export type NinjaPearResult =
  | { ok: true; data: NinjaPearUpdatesResponse; text: string }
  | { ok: false; error: string };

const BASE = "https://nubela.co";

/** 读取 API Key（兼容旧 env 名 PROXYCURL_API_KEY） */
export function getNinjaPearApiKey(): string | null {
  const key = process.env.NINJAPEARL_API_KEY?.trim() || process.env.PROXYCURL_API_KEY?.trim();
  return key || null;
}

export function hasNinjaPearKey() {
  return Boolean(getNinjaPearApiKey());
}

/** 领英公司页 URL → 规范化（去掉 /posts、query 等） */
export function normalizeLinkedInCompanyUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!u.hostname.includes("linkedin.com")) return url;
    const m = u.pathname.match(/^(\/company\/[^/]+)/i);
    if (m) {
      u.pathname = m[1] + "/";
      u.search = "";
      u.hash = "";
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** 从领英公司 slug 提取可读公司名（仅作兜底搜索词） */
export function linkedInSlugToLabel(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const m = u.pathname.match(/\/company\/([^/?#]+)/i);
    if (!m) return null;
    return m[1]
      .replace(/-/g, " ")
      .replace(/\b(ltd|llc|inc|sa|co)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

function formatUpdates(data: NinjaPearUpdatesResponse): string {
  const lines: string[] = [];
  if (data.x_profile) lines.push(`X/Twitter：${data.x_profile}`);
  if (data.blogs?.length) lines.push(`Blog sources: ${data.blogs.join(", ")}`);
  if (data.youtube_channels?.length) lines.push(`YouTube: ${data.youtube_channels.join(", ")}`);

  const updates = data.updates ?? [];
  if (!updates.length) {
    lines.push("(No recent blog / X / YouTube updates)");
    return lines.join("\n");
  }

  updates.forEach((u, i) => {
    const date = u.timestamp ? u.timestamp.slice(0, 10) : "";
    const src = u.source ? ` [${u.source}]` : "";
    lines.push(`${i + 1}. ${u.title ?? "Untitled"}${src}${date ? ` · ${date}` : ""}`);
    if (u.url) lines.push(`   ${u.url}`);
    if (u.description) lines.push(`   ${u.description.slice(0, 400)}`);
  });
  return lines.join("\n");
}

/** 按公司官网拉取最近公开更新（博客 / X / YouTube） */
export async function fetchCompanyUpdates(website: string): Promise<NinjaPearResult> {
  const key = getNinjaPearApiKey();
  if (!key) {
    return { ok: false, error: "NINJAPEARL_API_KEY (or PROXYCURL_API_KEY) is not configured" };
  }

  let site = website.trim();
  if (!site) return { ok: false, error: "Company website URL is required" };
  if (!/^https?:\/\//i.test(site)) site = `https://${site}`;

  try {
    const params = new URLSearchParams({ website: site, use_cache: "if-recent" });
    const res = await fetch(`${BASE}/api/v1/company/updates?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(25000),
    });
    const body = (await res.json()) as NinjaPearUpdatesResponse & { error?: string; message?: string };

    if (!res.ok) {
      const msg = body.error || body.message || `HTTP ${res.status}`;
      if (res.status === 401) {
        return {
          ok: false,
          error: "Invalid NinjaPear API Key. Proxycurl is deprecated — verify your key at https://nubela.co/dashboard",
        };
      }
      if (res.status === 403) return { ok: false, error: "NinjaPear account balance insufficient" };
      return { ok: false, error: `NinjaPear request failed: ${msg}` };
    }

    const text = formatUpdates(body);
    if (!text.trim()) return { ok: false, error: "NinjaPear returned no usable content" };
    return { ok: true, data: body, text };
  } catch (e) {
    return { ok: false, error: `NinjaPear request error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
