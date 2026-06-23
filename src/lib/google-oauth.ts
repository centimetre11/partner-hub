import { db } from "./db";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// drive.file：非敏感 scope，足以在已知文件夹里创建文件；openid/email 用于回显授权账号
export const GOOGLE_UPLOAD_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
].join(" ");

export type GoogleOauthConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
  uploaderEmail: string | null;
};

/** App 对外可访问的基础地址，用于拼 OAuth 回调 */
export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function oauthRedirectUri(): string {
  return `${appBaseUrl()}/api/google/oauth/callback`;
}

/** 读取已保存的 OAuth 配置（Client ID/Secret 优先取库，回退环境变量） */
export async function resolveGoogleOauthConfig(): Promise<GoogleOauthConfig | null> {
  const row = await db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
  const clientId = row?.gdriveOauthClientId?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret =
    row?.gdriveOauthClientSecret?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    refreshToken: row?.gdriveOauthRefreshToken?.trim() || null,
    uploaderEmail: row?.gdriveUploaderEmail?.trim() || null,
  };
}

/** 拼授权同意页 URL（access_type=offline + prompt=consent 才能拿到长期 refresh_token） */
export function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: "code",
    scope: GOOGLE_UPLOAD_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** 用授权码换取 refresh_token + access_token */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauthRedirectUri(),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Token exchange failed (${res.status})`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null };
}

/** 用 refresh_token 换取临时 access_token */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `Token refresh failed (${res.status})`,
    );
  }
  return data.access_token;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** 取得用于上传的 access_token（全局固定授权账号）。未连接时抛错。 */
export async function getUploaderAccessToken(): Promise<string> {
  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) {
    throw new Error("Google OAuth client is not configured (set Client ID/Secret in settings)");
  }
  if (!cfg.refreshToken) {
    throw new Error("No Google account connected for upload — connect one in settings first");
  }
  return refreshAccessToken(cfg.refreshToken, cfg.clientId, cfg.clientSecret);
}
