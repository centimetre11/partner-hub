import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { buildDingTalkJsapiConfig } from "@/lib/dingtalk/jsapi";

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const url = String(body.url ?? "").trim() || req.headers.get("referer") || "";
    if (!url) {
      return NextResponse.json({ error: "缺少页面 url" }, { status: 400 });
    }
    const config = await buildDingTalkJsapiConfig(url);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
