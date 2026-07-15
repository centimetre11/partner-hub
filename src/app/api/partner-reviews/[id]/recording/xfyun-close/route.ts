import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { closeXfyunRelaySession } from "@/lib/asr/xfyun-relay";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = (await req.json()) as { relaySessionId?: string };
  const relaySessionId = body.relaySessionId?.trim();
  if (!relaySessionId) {
    return NextResponse.json({ error: "缺少 relaySessionId" }, { status: 400 });
  }

  await closeXfyunRelaySession(relaySessionId, meetingId, uid);
  return NextResponse.json({ ok: true });
}
