export type LinkPreview = {
  url: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  provider: string;
};

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

function metaContent(html: string, ...keys: string[]): string | null {
  for (const key of keys) {
    // 同时兼容 property=".." content=".." 与 content=".." property=".." 两种顺序
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    );
    const m = html.match(re1) || html.match(re2);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function absolutize(maybeUrl: string | null, base: string): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

// Google Drive：从分享链接中提取文件 ID，拼接官方缩略图接口
function googleDriveThumb(url: string): string | null {
  const m =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m?.[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  return null;
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }

  const result: LinkPreview = {
    url,
    title: host,
    description: null,
    thumbnailUrl: null,
    provider: "web",
  };

  // ---- 特化：KMS (Confluence) ----
  if (/kms\.fineres\.com/i.test(host)) {
    result.provider = "kms";
  }
  // ---- 特化：Google Drive ----
  else if (/drive\.google\.com|docs\.google\.com/i.test(host)) {
    result.provider = "gdrive";
    const thumb = googleDriveThumb(url);
    if (thumb) result.thumbnailUrl = thumb;
  }
  // ---- 特化：Dropbox（把分享链接转成可直接取图的 raw 链接，图片类有效）----
  else if (/dropbox\.com/i.test(host)) {
    result.provider = "dropbox";
  }

  // ---- 通用：抓取 OG / Twitter 元数据 ----
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PartnerHubBot/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const html = (await res.text()).slice(0, 200_000);
        const title =
          metaContent(html, "og:title", "twitter:title") ||
          html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
        const description =
          metaContent(html, "og:description", "twitter:description", "description");
        const image =
          metaContent(html, "og:image", "og:image:url", "twitter:image", "twitter:image:src");
        if (title) result.title = decodeEntities(title);
        if (description) result.description = decodeEntities(description).slice(0, 500);
        const abs = absolutize(image ?? null, url);
        if (abs && !result.thumbnailUrl) result.thumbnailUrl = abs;
      } else if (ct.startsWith("image/")) {
        // 直接是图片链接，本身即缩略图
        if (!result.thumbnailUrl) result.thumbnailUrl = url;
      }
    }
  } catch {
    // 抓取失败（超时 / 需登录 / 跨域限制）：保留已知信息，回退图标由前端处理
  }

  return result;
}
