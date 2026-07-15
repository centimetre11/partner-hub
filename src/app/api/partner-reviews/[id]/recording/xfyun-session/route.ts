import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { buildXfyunRealtimeWsUrl, getXfyunAsrConfig } from "@/lib/asr/xfyun";

export const runtime = "nodejs";

/** 获取讯飞实时转写 WebSocket 握手地址（服务端签名，密钥不下发） */
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

  const uuid = randomUUID().replace(/-/g, "");
  const sessionId = randomUUID();
  const wsUrl = buildXfyunRealtimeWsUrl({
    appId: cfg.appId,
    apiKey: cfg.apiKey,
    apiSecret: cfg.apiSecret,
    lang: cfg.lang,
    uuid,
  });

  return NextResponse.json({
    ok: true,
    wsUrl,
    sessionId,
    sampleRate: cfg.sampleRate,
    frameBytes: cfg.frameBytes,
    frameIntervalMs: cfg.frameIntervalMs,
  });
}
