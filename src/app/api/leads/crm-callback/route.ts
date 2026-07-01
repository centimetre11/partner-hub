import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  getCrmCallbackPublicInfo,
  handleCrmLeadCallback,
  type CrmCallbackPayload,
} from "@/lib/leads-sync";

const CALLBACK_HEADER = "x-crm-callback-secret";

function normalizeSecretInput(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function getCallbackSecret() {
  return normalizeSecretInput(process.env.CRM_CALLBACK_SECRET ?? "");
}

function extractProvidedSecret(
  req: NextRequest,
  body?: Record<string, unknown>,
): string | null {
  const header = req.headers.get(CALLBACK_HEADER)?.trim();
  if (header) return normalizeSecretInput(header);
  const auth = req.headers.get("authorization")?.trim();
  if (auth?.startsWith("Bearer ")) return normalizeSecretInput(auth.slice("Bearer ".length));
  const query = req.nextUrl.searchParams.get("secret")?.trim();
  if (query) return normalizeSecretInput(query);
  const bodySecret = body?.callbackSecret;
  if (typeof bodySecret === "string" && bodySecret.trim()) return normalizeSecretInput(bodySecret);
  return null;
}

function isAuthorized(provided: string | null) {
  const secret = getCallbackSecret();
  if (!secret || !provided) return false;
  return provided === secret;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  const allowed = [
    "https://overseas.finereporthelp.com",
    "https://crm.finereporthelp.com",
    "https://crm.fineres.com",
    "https://mena.fineres.com",
  ];
  if (!allowed.some((o) => origin.startsWith(o))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": `Content-Type, ${CALLBACK_HEADER}, Authorization`,
  };
}

function requestBaseUrl(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "https://camelusai.com";
}

/** 浏览器可直接打开的测试/说明页（无需登录） */
export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const baseUrl = requestBaseUrl(req);
  return NextResponse.json(getCrmCallbackPublicInfo(baseUrl), { headers: cors });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  if (!getCallbackSecret()) {
    return NextResponse.json(
      { ok: false, error: "CRM_CALLBACK_SECRET not configured on server" },
      { status: 503, headers: cors },
    );
  }

  let body: CrmCallbackPayload & { callbackSecret?: string };
  try {
    body = (await req.json()) as CrmCallbackPayload & { callbackSecret?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: cors });
  }

  if (!isAuthorized(extractProvidedSecret(req, body))) {
    console.warn(
      `[crm-callback] Unauthorized from ${req.headers.get("origin") ?? req.headers.get("referer") ?? "unknown"}`,
    );
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: cors });
  }

  const { callbackSecret: _secret, ...payload } = body;
  const result = await handleCrmLeadCallback(payload);
  if (!result.ok) {
    const status = result.reason === "unknown_action" ? 400 : 502;
    return NextResponse.json(result, { status, headers: cors });
  }

  revalidatePath("/leads");
  if (payload.clueId?.trim()) {
    revalidatePath(`/leads/${payload.clueId.trim()}`);
  }

  return NextResponse.json(result, { headers: cors });
}
