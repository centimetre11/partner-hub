import { NextRequest, NextResponse } from "next/server";
import {
  buildDingTalkSuccessReply,
  getDingTalkCallbackSecrets,
  verifyDingTalkCallbackSignature,
  parseDingTalkEventJson,
  decryptDingTalkEncrypt,
} from "@/lib/dingtalk/events";
import { handleDingTalkRecordingEvent } from "@/lib/partner-review/dingtalk-ingest";
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
 * 钉钉事件订阅回调（HTTP 推送）：
 * - URL 校验 / 业务事件：解密后处理，并在 1500ms 内返回加密的 success
 * - OWNER_KEY 使用 Client ID（AppKey）
 */
export async function POST(req: NextRequest) {
  const secrets = await getDingTalkCallbackSecrets();
  const sp = req.nextUrl.searchParams;
  const signature = sp.get("msg_signature") ?? sp.get("signature") ?? "";
  const timestamp = sp.get("timestamp") ?? "";
  const nonce = sp.get("nonce") ?? "";

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const encrypt = typeof body.encrypt === "string" ? body.encrypt : "";

  // 明文事件（内部调试 / Stream 兼容）
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
    const plain = decryptDingTalkEncrypt(secrets.aesKey, encrypt, secrets.ownerKey);
    // URL 校验包可能是纯字符串；业务事件是 JSON
    if (plain.startsWith("{")) {
      const event = parseDingTalkEventJson(plain);
      const eventType = String(event.EventType ?? event.eventType ?? "").toLowerCase();
      // check_url 仅做连通性校验，不入业务
      if (eventType && eventType !== "check_url" && !eventType.includes("check")) {
        await handleDingTalkRecordingEvent(event);
      }
    }

    // 官方要求：始终返回加密 success（字段：msg_signature / timeStamp / nonce / encrypt）
    const reply = buildDingTalkSuccessReply({
      token: secrets.token,
      aesKey: secrets.aesKey,
      ownerKey: secrets.ownerKey,
      timestamp: timestamp || undefined,
      nonce: nonce || undefined,
    });
    return NextResponse.json(reply);
  } catch (e) {
    console.error("[dingtalk/callback]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
