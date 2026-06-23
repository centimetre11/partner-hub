import { NextRequest, NextResponse } from "next/server";
import { loginByWecomCode } from "@/lib/wecom-oauth";

export async function POST(req: NextRequest) {
  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }

  if (!code.trim()) {
    return NextResponse.json({ ok: false, code: "missing_code", message: "Missing WeCom OAuth code." }, { status: 400 });
  }

  const result = await loginByWecomCode(code);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message, wecomUserId: result.wecomUserId },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
    redirectTo: "/",
  });
}
