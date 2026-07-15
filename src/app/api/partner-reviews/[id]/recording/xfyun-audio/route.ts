import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { sendRelayAudio } from "@/lib/asr/xfyun-relay";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 转发 PCM 音频帧到服务器侧讯飞连接，并返回最新转写 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

    const relaySessionId = req.headers.get("x-relay-session")?.trim();
    if (!relaySessionId) {
      return NextResponse.json({ error: "缺少 X-Relay-Session" }, { status: 400 });
    }

    const { id: meetingId } = await ctx.params;
    const buf = Buffer.from(await req.arrayBuffer());

    const snap = sendRelayAudio(relaySessionId, meetingId, uid, buf);
    const sentence = snap.lastSentence;
    return NextResponse.json({
      ok: true,
      plain: snap.plain,
      interim: snap.interim || undefined,
      sentence: sentence ?? undefined,
      error: snap.error ?? undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
