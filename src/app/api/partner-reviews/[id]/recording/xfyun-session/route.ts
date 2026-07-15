import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { getXfyunAsrConfig } from "@/lib/asr/xfyun";
import { createXfyunRelaySession } from "@/lib/asr/xfyun-relay";

export const runtime = "nodejs";

/** 在服务器侧建立讯飞 WebSocket，浏览器只上传 PCM（绕过 IP 白名单） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const cfg = getXfyunAsrConfig();
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: "未配置讯飞转写。请在服务器 .env 设置 XFYUN_APP_ID / XFYUN_API_KEY / XFYUN_API_SECRET" },
      { status: 400 },
    );
  }

  const { id: meetingId } = await ctx.params;
  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) return NextResponse.json({ error: "会议不存在" }, { status: 404 });
  if (meeting.status === "DONE") {
    return NextResponse.json({ error: "已完成会议不可开录" }, { status: 400 });
  }

  try {
    const relay = await createXfyunRelaySession(meetingId, uid);
    return NextResponse.json({
      ok: true,
      mode: "relay",
      relaySessionId: relay.relaySessionId,
      sessionId: relay.relaySessionId,
      sampleRate: relay.sampleRate,
      frameBytes: relay.frameBytes,
      frameIntervalMs: relay.frameIntervalMs,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
