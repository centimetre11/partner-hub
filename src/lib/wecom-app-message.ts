import { db } from "@/lib/db";
import { getWecomAccessToken, resolveWecomOauthConfig, type WecomOauthConfig } from "@/lib/wecom-oauth";
import { isValidWecomUserId, sanitizeWecomUserId } from "@/lib/wecom-identity-validation";

const MAX_CONTENT_BYTES = 2048;
const MAX_TEXTCARD_TITLE_CHARS = 128;
export const MAX_TEXTCARD_DESC_BYTES = 512;
const MAX_TEXTCARD_DESC_CHARS = MAX_TEXTCARD_DESC_BYTES;
const MAX_TEXTCARD_URL_BYTES = 2048;
const MAX_TEXTCARD_BTNTXT_CHARS = 4;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 按 UTF-8 字节数截断（企微 textcard description 上限 512 bytes） */
export function truncateToMaxBytes(text: string, maxBytes: number, suffix = "…"): string {
  if (maxBytes <= 0) return "";
  if (byteLength(text) <= maxBytes) return text;
  const suffixBytes = byteLength(suffix);
  let out = "";
  for (const ch of text) {
    const candidate = out + ch;
    if (byteLength(candidate) + suffixBytes > maxBytes) break;
    out = candidate;
  }
  return out + suffix;
}

/**
 * textcard 正文（guideToBot 前）预留 HTML 尾部与 <br/> 转换空间，避免超长被拒。
 */
export function fitTextcardPlainBody(body: string, reserveBytes = 180): string {
  const maxPlain = MAX_TEXTCARD_DESC_BYTES - reserveBytes;
  const normalized = body.trim();
  if (maxPlain <= 0) return "";
  if (byteLength(normalized) <= maxPlain) return normalized;
  return truncateToMaxBytes(normalized, maxPlain);
}

type WecomApiError = {
  errcode?: number;
  errmsg?: string;
};

type WecomMessageSendResponse = WecomApiError & {
  msgid?: string;
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
};

export type WecomAppMessageType = "text" | "markdown" | "textcard";

export type SendWecomAppMessageInput = {
  touser: string[];
  content: string;
  msgtype?: WecomAppMessageType;
  /** textcard 标题（msgtype=textcard 时必填，或由 content 首行推断） */
  title?: string;
  /** textcard 跳转链接，需 https */
  url?: string;
  /** textcard 按钮文案，最多 4 字 */
  btntxt?: string;
};

export type SendWecomAppMessageResult = {
  ok: true;
  msgid?: string;
  invaliduser?: string[];
  invalidparty?: string[];
  invalidtag?: string[];
} | {
  ok: false;
  error: string;
};

export type WecomAppMessageConfig = WecomOauthConfig & {
  agentId: string;
};

export function isWecomAppMessageConfigured(): boolean {
  return resolveWecomAppMessageConfig() !== null;
}

export function resolveWecomAppMessageConfig(): WecomAppMessageConfig | null {
  const cfg = resolveWecomOauthConfig();
  const agentId = cfg?.agentId?.trim();
  if (!cfg || !agentId) return null;
  return { ...cfg, agentId };
}

function apiError(prefix: string, data: WecomApiError): Error {
  return new Error(`${prefix}: ${data.errcode ?? "unknown"} ${data.errmsg ?? ""}`.trim());
}

function splitIds(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitInvalidList(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  return splitIds(raw);
}

export function parseWecomUserIds(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of splitIds(raw)) {
    const id = sanitizeWecomUserId(part);
    if (isValidWecomUserId(id)) valid.push(id);
    else invalid.push(part);
  }
  return { valid, invalid };
}

export async function resolveHubUserIdsToWecomUserIds(hubUserIds: string[]): Promise<{
  wecomUserIds: string[];
  missingHubUserIds: string[];
  unboundHubUserIds: string[];
}> {
  const wecomUserIds: string[] = [];
  const missingHubUserIds: string[] = [];
  const unboundHubUserIds: string[] = [];

  for (const hubUserId of hubUserIds) {
    const user = await db.user.findUnique({
      where: { id: hubUserId },
      select: { id: true, wecomUserId: true },
    });
    if (!user) {
      missingHubUserIds.push(hubUserId);
      continue;
    }
    if (!user.wecomUserId) {
      unboundHubUserIds.push(hubUserId);
      continue;
    }
    wecomUserIds.push(user.wecomUserId);
  }

  return { wecomUserIds, missingHubUserIds, unboundHubUserIds };
}

export async function resolveHubUserNamesToWecomUserIds(names: string[]): Promise<{
  wecomUserIds: string[];
  missingNames: string[];
  unboundNames: string[];
}> {
  const wecomUserIds: string[] = [];
  const missingNames: string[] = [];
  const unboundNames: string[] = [];

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const user = await db.user.findFirst({
      where: { name: trimmed },
      select: { id: true, name: true, wecomUserId: true },
    });
    if (!user) {
      missingNames.push(trimmed);
      continue;
    }
    if (!user.wecomUserId) {
      unboundNames.push(trimmed);
      continue;
    }
    wecomUserIds.push(user.wecomUserId);
  }

  return { wecomUserIds, missingNames, unboundNames };
}

function parseAgentId(cfg: WecomAppMessageConfig): number | null {
  const agentid = Number.parseInt(cfg.agentId, 10);
  return Number.isFinite(agentid) ? agentid : null;
}

function normalizeTouser(touser: string[]): string[] | null {
  const ids = [...new Set(touser.map((id) => sanitizeWecomUserId(id)).filter(isValidWecomUserId))];
  return ids.length ? ids : null;
}

async function postWecomAppMessage(
  cfg: WecomAppMessageConfig,
  body: Record<string, unknown>,
): Promise<SendWecomAppMessageResult> {
  try {
    const accessToken = await getWecomAccessToken(cfg);
    const url = new URL("/cgi-bin/message/send", cfg.apiBaseUrl);
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: `WeCom message/send failed: HTTP ${res.status}` };

    const data = (await res.json()) as WecomMessageSendResponse;
    if (data.errcode && data.errcode !== 0) {
      return { ok: false, error: apiError("WeCom message/send failed", data).message };
    }

    return {
      ok: true,
      msgid: data.msgid,
      invaliduser: splitInvalidList(data.invaliduser),
      invalidparty: splitInvalidList(data.invalidparty),
      invalidtag: splitInvalidList(data.invalidtag),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WeCom message/send failed." };
  }
}

export async function sendWecomAppMessage(input: SendWecomAppMessageInput): Promise<SendWecomAppMessageResult> {
  const cfg = resolveWecomAppMessageConfig();
  if (!cfg) {
    return {
      ok: false,
      error: "WeCom app message is not configured. Set WECOM_CORP_ID, WECOM_APP_SECRET, and WECOM_AGENT_ID.",
    };
  }

  const touser = normalizeTouser(input.touser);
  if (!touser) {
    return { ok: false, error: "No valid WeCom userid recipients." };
  }

  const agentid = parseAgentId(cfg);
  if (agentid === null) {
    return { ok: false, error: `Invalid WECOM_AGENT_ID: ${cfg.agentId}` };
  }

  const msgtype = input.msgtype ?? "text";
  const touserStr = touser.join("|");
  const base = {
    touser: touserStr,
    agentid,
    enable_duplicate_check: 0,
    duplicate_check_interval: 1800,
  };

  if (msgtype === "textcard") {
    const title = input.title?.trim() || input.content.trim().split(/\n/)[0]?.trim();
    let description = input.content.trim();
    const cardUrl = input.url?.trim();
    if (!title) return { ok: false, error: "textcard requires title (or non-empty content first line)." };
    if (!description) return { ok: false, error: "Message content is empty." };
    if (!cardUrl?.startsWith("http://") && !cardUrl?.startsWith("https://")) {
      return { ok: false, error: "textcard requires url (http/https)." };
    }
    if (title.length > MAX_TEXTCARD_TITLE_CHARS) {
      return { ok: false, error: `textcard title exceeds ${MAX_TEXTCARD_TITLE_CHARS} characters.` };
    }
    if (byteLength(description) > MAX_TEXTCARD_DESC_CHARS) {
      description = truncateToMaxBytes(description, MAX_TEXTCARD_DESC_CHARS);
    }
    if (byteLength(cardUrl) > MAX_TEXTCARD_URL_BYTES) {
      return { ok: false, error: `textcard url exceeds ${MAX_TEXTCARD_URL_BYTES} bytes.` };
    }
    const btntxt = (input.btntxt?.trim() || "详情").slice(0, MAX_TEXTCARD_BTNTXT_CHARS);

    return postWecomAppMessage(cfg, {
      ...base,
      msgtype: "textcard",
      textcard: {
        title,
        description,
        url: cardUrl,
        btntxt,
      },
    });
  }

  const content = input.content.trim();
  if (!content) return { ok: false, error: "Message content is empty." };
  if (byteLength(content) > MAX_CONTENT_BYTES) {
    return { ok: false, error: `Message content exceeds ${MAX_CONTENT_BYTES} bytes (WeCom limit).` };
  }

  const body =
    msgtype === "markdown"
      ? {
          ...base,
          msgtype: "markdown",
          markdown: { content },
        }
      : {
          ...base,
          msgtype: "text",
          text: { content },
          safe: 0,
        };

  return postWecomAppMessage(cfg, body);
}
