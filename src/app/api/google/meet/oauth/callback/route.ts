import { NextRequest, NextResponse } from "next/server";
import { connectUserMeetFromCode, meetAccountUrl } from "@/lib/google-meet-oauth";
import { resolveGoogleOauthConfig } from "@/lib/google-oauth";

const STATE_COOKIE = "gmeet_oauth_state";
const USER_COOKIE = "gmeet_oauth_uid";

function accountRedirect(status: string) {
  return NextResponse.redirect(new URL(meetAccountUrl(status)));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const userId = req.cookies.get(USER_COOKIE)?.value;

  if (error) return accountRedirect("denied");
  if (!code || !state || !expectedState || state !== expectedState || !userId) {
    return accountRedirect("bad_state");
  }

  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) return accountRedirect("missing_client");

  try {
    await connectUserMeetFromCode(userId, code);
    const res = accountRedirect("connected");
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(USER_COOKIE);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("refresh token") ? "no_refresh" : "error";
    return accountRedirect(status);
  }
}
