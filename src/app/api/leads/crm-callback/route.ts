import { NextRequest, NextResponse } from "next/server";
import {
  getCrmCallbackPublicInfo,
  handleCrmLeadCallback,
  type CrmCallbackPayload,
} from "@/lib/leads-sync";

const CALLBACK_HEADER = "x-crm-callback-secret";

function getCallbackSecret() {
  return process.env.CRM_CALLBACK_SECRET?.trim() || "";
}

function isAuthorized(req: NextRequest) {
  const secret = getCallbackSecret();
  if (!secret) return false;
  const header = req.headers.get(CALLBACK_HEADER)?.trim();
  const auth = req.headers.get("authorization")?.trim();
  if (header === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
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

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: cors });
  }

  let body: CrmCallbackPayload;
  try {
    body = (await req.json()) as CrmCallbackPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: cors });
  }

  const result = await handleCrmLeadCallback(body);
  if (!result.ok) {
    const status = result.reason === "unknown_action" ? 400 : 502;
    return NextResponse.json(result, { status, headers: cors });
  }
  return NextResponse.json(result, { headers: cors });
}
