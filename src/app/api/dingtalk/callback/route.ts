import { NextRequest, NextResponse } from "next/server";
import {
  encryptDingTalkReply,
  getDingTalkCallbackSecrets,
  signDingTalkReply,
  verifyDingTalkCallbackSignature,
  parseDingTalkEventJson,
} from "@/lib/dingtalk/events";
import { decryptAndHandleDingTalkBody, handleDingTalkRecordingEvent } from "@/lib/partner-review/dingtalk-ingest";
import { resolveDingTalkConfig, isDingTalkConfigured } from "@/lib/dingtalk/config";

export async function GET(req: NextRequest) {
  const config = await resolveDingTalkConfig();
  return NextResponse.json({
    ok: true,
    service: "dingtalk-callback",
    configured: isDingTalkConfigured(config),
    subscribeEvent: "dinger_record_finish",
    hint: "在钉钉开放平台「事件与回调」填本 URL；订阅 dinger_record_finish（A1 录音完成）。需 HTTPS 公网地址，并配置 Token + EncodingAESKey。",
    docs: {
      hardwareOverview: "https://open.dingtalk.com/document/development/intelligent-hardware-overview",
      eventSubscription: "https://open.dingtalk.com/document/orgapp-server/event-subscription-overview",
      diskApi: "https://open.dingtalk.com/document/orgapp-server/disk-overview",
      serverApi: "https://open.dingtalk.com/document/development/server-api-calling-guide",
    },
    query: Object.fromEntries(req.nextUrl.searchParams.entries()),
  });
}

/**
 * 钉钉事件订阅回调：
 * 1) 首次配置 URL 时的加密 challenge 回声
 * 2) 录音/转写完成等业务事件
 */
export async function POST(req: NextRequest) {
  const secrets = await getDingTalkCallbackSecrets();
  const sp = req.nextUrl.searchParams;
  const signature = sp.get("signature") ?? sp.get("msg_signature") ?? "";
  const timestamp = sp.get("timestamp") ?? "";
  const nonce = sp.get("nonce") ?? "";

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const encrypt = typeof body.encrypt === "string" ? body.encrypt : "";

  // 明文事件（Stream / 测试）
  if (!encrypt) {
    const event = parseDingTalkEventJson(JSON.stringify(body));
    const result = await handleDingTalkRecordingEvent(event);
    return NextResponse.json(result);
  }

  if (!secrets.token || !secrets.aesKey) {
    return NextResponse.json({ ok: false, error: "DingTalk token/aesKey not configured" }, { status: 503 });
  }

  if (
    signature &&
    !verifyDingTalkCallbackSignature({
      token: secrets.token,
      timestamp,
      nonce,
      encrypt,
      signature,
    })
  ) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    const { plain, result } = await decryptAndHandleDingTalkBody({
      encrypt,
      aesKey: secrets.aesKey,
      corpId: secrets.corpId,
    });

    // URL 验证：原样加密回传 challenge
    if (!plain.startsWith("{")) {
      const timeStamp = String(Date.now());
      const replyNonce = nonce || Math.random().toString(36).slice(2, 10);
      const enc = encryptDingTalkReply(secrets.aesKey, plain, secrets.corpId || "dingtalk");
      const msgSignature = signDingTalkReply(secrets.token, timeStamp, replyNonce, enc);
      return NextResponse.json({
        msg_signature: msgSignature,
        timeStamp,
        nonce: replyNonce,
        encrypt: enc,
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[dingtalk/callback]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
