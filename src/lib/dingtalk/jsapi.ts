import "server-only";

import { createHash, randomBytes } from "crypto";
import { getDingTalkAccessToken } from "./token";
import { isDingTalkConfigured, resolveDingTalkConfig } from "./config";

type TicketCache = { ticket: string; expiresAt: number };
let ticketCache: TicketCache | null = null;

async function getJsapiTicket(): Promise<string> {
  if (ticketCache && ticketCache.expiresAt > Date.now() + 60_000) {
    return ticketCache.ticket;
  }
  const accessToken = await getDingTalkAccessToken();
  const url = new URL("https://oapi.dingtalk.com/get_jsapi_ticket");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const data = (await res.json()) as {
    errcode?: number;
    errmsg?: string;
    ticket?: string;
    expires_in?: number;
  };
  if (!res.ok || data.errcode !== 0 || !data.ticket) {
    throw new Error(`钉钉 get_jsapi_ticket 失败: ${data.errmsg ?? res.statusText}`);
  }
  ticketCache = {
    ticket: data.ticket,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  return data.ticket;
}

function signJsapi(opts: { ticket: string; nonceStr: string; timeStamp: string; url: string }) {
  const plain = `jsapi_ticket=${opts.ticket}&noncestr=${opts.nonceStr}&timestamp=${opts.timeStamp}&url=${opts.url}`;
  return createHash("sha1").update(plain).digest("hex");
}

export type DingTalkJsapiConfig = {
  agentId: string;
  corpId: string;
  timeStamp: string;
  nonceStr: string;
  signature: string;
  jsApiList: string[];
  dingerTemplateId: string;
};

/** 为当前页面生成 dd.config 所需签名（url 须不含 hash） */
export async function buildDingTalkJsapiConfig(pageUrl: string): Promise<DingTalkJsapiConfig> {
  const config = await resolveDingTalkConfig();
  if (!isDingTalkConfigured(config)) {
    throw new Error("钉钉未配置或已禁用");
  }
  if (!config.corpId?.trim()) {
    throw new Error("请先在团队设置中填写钉钉 CorpId（JSAPI 鉴权需要）");
  }
  if (!config.agentId?.trim()) {
    throw new Error("请先在团队设置中填写钉钉 AgentId（JSAPI 鉴权需要）");
  }

  const url = pageUrl.split("#")[0] ?? pageUrl;
  const ticket = await getJsapiTicket();
  const nonceStr = randomBytes(8).toString("hex");
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const signature = signJsapi({ ticket, nonceStr, timeStamp, url });

  return {
    agentId: config.agentId.trim(),
    corpId: config.corpId.trim(),
    timeStamp,
    nonceStr,
    signature,
    jsApiList: ["biz.dinger.startDingerRecord"],
    dingerTemplateId: config.dingerTemplateId?.trim() || "",
  };
}
