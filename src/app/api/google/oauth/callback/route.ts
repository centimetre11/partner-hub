import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import {
  resolveGoogleOauthConfig,
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  appBaseUrl,
} from "@/lib/google-oauth";

const STATE_COOKIE = "gdrive_oauth_state";

function settingsRedirect(status: string) {
  return NextResponse.redirect(new URL(`/settings?gdrive_oauth=${status}`, appBaseUrl()));
}

export async function GET(req: NextRequest) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;

  if (error) return settingsRedirect("denied");
  if (!code || !state || !expectedState || state !== expectedState) {
    return settingsRedirect("bad_state");
  }

  const cfg = await resolveGoogleOauthConfig();
  if (!cfg) return settingsRedirect("missing_client");

  try {
    const { accessToken, refreshToken } = await exchangeCodeForTokens(
      code,
      cfg.clientId,
      cfg.clientSecret,
    );
    if (!refreshToken) {
      // 用户之前已授权过、Google 不再返回 refresh_token —— 提示重新授权
      return settingsRedirect("no_refresh");
    }
    const email = await fetchGoogleUserEmail(accessToken);

    await db.systemAmmoConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        gdriveOauthRefreshToken: refreshToken,
        gdriveUploaderEmail: email,
      },
      update: {
        gdriveOauthRefreshToken: refreshToken,
        gdriveUploaderEmail: email,
      },
    });

    const res = settingsRedirect("connected");
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return settingsRedirect("error");
  }
}
