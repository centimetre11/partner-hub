import { NextRequest, NextResponse } from "next/server";
import { loginByWecomCode, resolveWecomOauthConfig } from "@/lib/wecom-oauth";

const STATE_COOKIE = "wecom_oauth_state";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function appOrigin(): string {
  return resolveWecomOauthConfig()?.appBaseUrl ?? "http://localhost:3000";
}

function loginRedirect(status: string, extra?: Record<string, string>) {
  const url = new URL("/login", appOrigin());
  url.searchParams.set("wecom_oauth", status);
  for (const [k, v] of Object.entries(extra ?? {})) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code) return loginRedirect("missing_code");
  if (expectedState && state !== expectedState) return loginRedirect("bad_state");

  const result = await loginByWecomCode(code);
  if (!result.ok) {
    return loginRedirect(result.code, result.wecomUserId ? { wecomUserId: result.wecomUserId } : undefined);
  }

  const redirectTo = safeRedirectPath(url.searchParams.get("redirect"));
  const res = NextResponse.redirect(new URL(redirectTo, appOrigin()));
  res.cookies.delete(STATE_COOKIE);
  return res;
}
