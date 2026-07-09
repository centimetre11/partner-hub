import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { buildMeetAuthUrl } from "@/lib/google-meet-oauth";
import { appBaseUrl, resolveGoogleOauthConfig } from "@/lib/google-oauth";

const STATE_COOKIE = "gmeet_oauth_state";
const USER_COOKIE = "gmeet_oauth_uid";

export async function GET() {
  const user = await requireUser();

  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) {
    return NextResponse.redirect(
      new URL("/account?google_meet=missing_client#google-meet", appBaseUrl()),
    );
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildMeetAuthUrl(cfg.clientId, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set(USER_COOKIE, user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
