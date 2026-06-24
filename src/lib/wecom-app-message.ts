import { db } from "@/lib/db";
import { getWecomAccessToken, resolveWecomOauthConfig, type WecomOauthConfig } from "@/lib/wecom-oauth";
import { isValidWecomUserId, sanitizeWecomUserId } from "@/lib/wecom-identity-validation";

const MAX_CONTENT_BYTES = 2048;

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

export type WecomAppMessageType = "text" | "markdown";

export type SendWecomAppMessageInput = {
  touser: string[];
  content: string;
  msgtype?: WecomAppMessageType;
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

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
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

export async function sendWecomAppMessage(input: SendWecomAppMessageInput): Promise<SendWecomAppMessageResult> {
  const cfg = resolveWecomAppMessageConfig();
  if (!cfg) {
    return {
      ok: false,
      error: "WeCom app message is not configured. Set WECOM_CORP_ID, WECOM_APP_SECRET, and WECOM_AGENT_ID.",
    };
  }

  const touser = [...new Set(input.touser.map((id) => sanitizeWecomUserId(id)).filter(isValidWecomUserId))];
  if (!touser.length) {
    return { ok: false, error: "No valid WeCom userid recipients." };
  }

  const content = input.content.trim();
  if (!content) return { ok: false, error: "Message content is empty." };
  if (byteLength(content) > MAX_CONTENT_BYTES) {
    return { ok: false, error: `Message content exceeds ${MAX_CONTENT_BYTES} bytes (WeCom limit).` };
  }

  const msgtype: WecomAppMessageType = input.msgtype === "markdown" ? "markdown" : "text";
  const agentid = Number.parseInt(cfg.agentId, 10);
  if (!Number.isFinite(agentid)) {
    return { ok: false, error: `Invalid WECOM_AGENT_ID: ${cfg.agentId}` };
  }

  const body =
    msgtype === "markdown"
      ? {
          touser: touser.join("|"),
          msgtype: "markdown",
          agentid,
          markdown: { content },
          enable_duplicate_check: 0,
          duplicate_check_interval: 1800,
        }
      : {
          touser: touser.join("|"),
          msgtype: "text",
          agentid,
          text: { content },
          safe: 0,
          enable_duplicate_check: 0,
          duplicate_check_interval: 1800,
        };

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
