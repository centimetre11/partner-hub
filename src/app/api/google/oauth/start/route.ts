import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { resolveGoogleOauthConfig, buildAuthUrl } from "@/lib/google-oauth";

const STATE_COOKIE = "gdrive_oauth_state";

export async function GET() {
  await requireSuperAdmin();

  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) {
    return NextResponse.redirect(
      new URL("/settings?gdrive_oauth=missing_client", process.env.APP_BASE_URL || "http://localhost:3000"),
    );
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(cfg.clientId, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
