import { db } from "./db";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  refreshAccessToken,
  resolveGoogleOauthConfig,
} from "./google-oauth";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_MEET_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
].join(" ");

/** Meet OAuth 专用对外域名（可与 APP_BASE_URL 不同，例如 camelusai.com） */
export function meetOauthBaseUrl(): string {
  return (
    process.env.GOOGLE_MEET_OAUTH_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function meetOauthRedirectUri(): string {
  return `${meetOauthBaseUrl()}/api/google/meet/oauth/callback`;
}

export function meetAccountUrl(status?: string): string {
  const base = `${meetOauthBaseUrl()}/account`;
  if (!status) return `${base}#google-meet`;
  return `${base}?google_meet=${encodeURIComponent(status)}#google-meet`;
}

export function buildMeetAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: meetOauthRedirectUri(),
    response_type: "code",
    scope: GOOGLE_MEET_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeMeetCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: meetOauthRedirectUri(),
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

export type UserGoogleMeetStatus = {
  connected: boolean;
  googleEmail: string | null;
  clientConfigured: boolean;
};

export async function getUserGoogleMeetStatus(userId: string): Promise<UserGoogleMeetStatus> {
  const cfg = await resolveGoogleOauthConfig();
  const row = await db.userGoogleMeetCredential.findUnique({
    where: { userId },
    select: { googleEmail: true, refreshToken: true },
  });
  return {
    connected: !!row?.refreshToken?.trim(),
    googleEmail: row?.googleEmail?.trim() || null,
    clientConfigured: !!cfg,
  };
}

export async function getUserMeetAccessToken(userId: string): Promise<string> {
  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) {
    throw new Error("Google OAuth client is not configured (set Client ID/Secret in team settings)");
  }
  const row = await db.userGoogleMeetCredential.findUnique({
    where: { userId },
    select: { refreshToken: true },
  });
  if (!row?.refreshToken?.trim()) {
    throw new Error("No Google account connected for Meet — connect one in Account settings first");
  }
  return refreshAccessToken(row.refreshToken, cfg.clientId, cfg.clientSecret);
}

export async function saveUserMeetCredential(
  userId: string,
  refreshToken: string,
  googleEmail: string | null,
): Promise<void> {
  await db.userGoogleMeetCredential.upsert({
    where: { userId },
    create: { userId, refreshToken, googleEmail },
    update: { refreshToken, googleEmail },
  });
}

export async function disconnectUserMeet(userId: string): Promise<void> {
  await db.userGoogleMeetCredential.deleteMany({ where: { userId } });
}

export async function connectUserMeetFromCode(userId: string, code: string): Promise<{ googleEmail: string | null }> {
  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) throw new Error("Google OAuth client is not configured");
  const { accessToken, refreshToken } = await exchangeMeetCodeForTokens(code, cfg.clientId, cfg.clientSecret);
  if (!refreshToken) {
    throw new Error("No refresh token returned — revoke access on Google side, then reconnect");
  }
  const googleEmail = await fetchGoogleUserEmail(accessToken);
  await saveUserMeetCredential(userId, refreshToken, googleEmail);
  return { googleEmail };
}
