import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { recordSystemEvent } from "@/lib/activity-log";
import { isValidWecomUserId, sanitizeWecomUserId } from "@/lib/wecom-identity-validation";

const DEFAULT_API_BASE_URL = "https://qyapi.weixin.qq.com";

type TokenCache = {
  key: string;
  accessToken: string;
  expiresAt: number;
};

type WecomApiError = {
  errcode?: number;
  errmsg?: string;
};

type WecomTokenResponse = WecomApiError & {
  access_token?: string;
  expires_in?: number;
};

type WecomUserInfoResponse = WecomApiError & {
  UserId?: string;
  OpenId?: string;
  user_ticket?: string;
};

let tokenCache: TokenCache | null = null;

export type WecomOauthConfig = {
  corpId: string;
  appSecret: string;
  agentId?: string;
  appBaseUrl: string;
  apiBaseUrl: string;
};

export type WecomLoginResult =
  | { ok: true; user: { id: string; name: string; email: string; wecomUserId: string } }
  | { ok: false; status: number; code: string; message: string; wecomUserId?: string };

export function resolveWecomOauthConfig(): WecomOauthConfig | null {
  const corpId = process.env.WECOM_CORP_ID?.trim();
  const appSecret = process.env.WECOM_APP_SECRET?.trim();
  const appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  if (!corpId || !appSecret) return null;
  return {
    corpId,
    appSecret,
    agentId: process.env.WECOM_AGENT_ID?.trim() || undefined,
    appBaseUrl,
    apiBaseUrl: (process.env.WECOM_API_BASE_URL || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, ""),
  };
}

function apiError(prefix: string, data: WecomApiError): Error {
  return new Error(`${prefix}: ${data.errcode ?? "unknown"} ${data.errmsg ?? ""}`.trim());
}

export async function getWecomAccessToken(cfg: WecomOauthConfig): Promise<string> {
  const key = `${cfg.corpId}:${cfg.appSecret}`;
  const now = Date.now();
  if (tokenCache?.key === key && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const url = new URL("/cgi-bin/gettoken", cfg.apiBaseUrl);
  url.searchParams.set("corpid", cfg.corpId);
  url.searchParams.set("corpsecret", cfg.appSecret);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WeCom token request failed: HTTP ${res.status}`);
  const data = (await res.json()) as WecomTokenResponse;
  if (data.errcode && data.errcode !== 0) throw apiError("WeCom token request failed", data);
  if (!data.access_token) throw new Error("WeCom token request failed: missing access_token");

  tokenCache = {
    key,
    accessToken: data.access_token,
    expiresAt: now + Math.max(60, data.expires_in ?? 7200) * 1000,
  };
  return data.access_token;
}

export async function getWecomUserIdByCode(code: string, cfg: WecomOauthConfig): Promise<string> {
  const cleanCode = code.trim();
  if (!cleanCode) throw new Error("Missing WeCom OAuth code");

  const accessToken = await getWecomAccessToken(cfg);
  const url = new URL("/cgi-bin/auth/getuserinfo", cfg.apiBaseUrl);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("code", cleanCode);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WeCom userinfo request failed: HTTP ${res.status}`);
  const data = (await res.json()) as WecomUserInfoResponse;
  if (data.errcode && data.errcode !== 0) throw apiError("WeCom userinfo request failed", data);
  if (!data.UserId) {
    throw new Error(data.OpenId ? "WeCom userinfo returned OpenId but no UserId" : "WeCom userinfo missing UserId");
  }

  const wecomUserId = sanitizeWecomUserId(data.UserId);
  if (!isValidWecomUserId(wecomUserId)) throw new Error("WeCom userinfo returned invalid UserId");
  return wecomUserId;
}

export function buildWecomAuthorizeUrl(cfg: WecomOauthConfig, redirectUri: string, state: string): string {
  const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
  url.searchParams.set("appid", cfg.corpId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_base");
  url.searchParams.set("state", state);
  if (cfg.agentId) url.searchParams.set("agentid", cfg.agentId);
  return `${url.toString()}#wechat_redirect`;
}

export async function loginByWecomUserId(wecomUserId: string): Promise<WecomLoginResult> {
  const cleanUserId = sanitizeWecomUserId(wecomUserId);
  if (!isValidWecomUserId(cleanUserId)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_userid",
      message: "Invalid WeCom UserID.",
    };
  }

  const user = await db.user.findUnique({
    where: { wecomUserId: cleanUserId },
    select: { id: true, name: true, email: true, wecomUserId: true },
  });

  if (!user?.wecomUserId) {
    void recordSystemEvent({
      category: "AUTH",
      action: "auth.wecom_login_unbound",
      targetType: "WeComUser",
      targetId: cleanUserId,
      targetLabel: cleanUserId,
      summary: `WeCom auto-login failed: ${cleanUserId} is not bound to a system user`,
      status: "FAILED",
    });
    return {
      ok: false,
      status: 403,
      code: "not_bound",
      message: "This WeCom UserID is not bound to a system account.",
      wecomUserId: cleanUserId,
    };
  }

  await createSession(user.id);
  void recordSystemEvent({
    category: "AUTH",
    action: "auth.wecom_login",
    actorId: user.id,
    actorLabel: user.name,
    summary: `${user.name} signed in with WeCom`,
    meta: { wecomUserId: cleanUserId, email: user.email },
  });

  return { ok: true, user: { ...user, wecomUserId: user.wecomUserId } };
}

export async function loginByWecomCode(code: string): Promise<WecomLoginResult> {
  const cfg = resolveWecomOauthConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 500,
      code: "missing_config",
      message: "WeCom OAuth is not configured.",
    };
  }

  try {
    const wecomUserId = await getWecomUserIdByCode(code, cfg);
    return loginByWecomUserId(wecomUserId);
  } catch (e) {
    return {
      ok: false,
      status: 502,
      code: "wecom_api_error",
      message: e instanceof Error ? e.message : "WeCom OAuth request failed.",
    };
  }
}
