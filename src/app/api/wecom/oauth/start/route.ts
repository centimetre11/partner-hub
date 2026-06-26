import { NextRequest, NextResponse } from "next/server";
import { buildWecomAuthorizeUrl, resolveWecomOauthConfig } from "@/lib/wecom-oauth";
import { defaultWecomOAuthRedirect } from "@/lib/wecom-env";

const STATE_COOKIE = "wecom_oauth_state";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(req: NextRequest) {
  const cfg = resolveWecomOauthConfig();
  if (!cfg) {
    const fallback = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
    return NextResponse.redirect(new URL("/login?wecom_oauth=missing_config", fallback));
  }

  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") ?? "";
  const redirectParam = url.searchParams.get("redirect");
  const redirect = redirectParam
    ? safeRedirectPath(redirectParam)
    : defaultWecomOAuthRedirect(ua);
  const state = crypto.randomUUID();
  const callbackUrl = new URL("/api/wecom/oauth/callback", cfg.appBaseUrl);
  callbackUrl.searchParams.set("redirect", redirect);

  const res = NextResponse.redirect(buildWecomAuthorizeUrl(cfg, callbackUrl.toString(), state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
