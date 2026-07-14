"use client";

import * as dd from "dingtalk-jsapi";

export function isDingTalkClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // dingtalk-jsapi ENV
    const env = (dd as { env?: { platform?: string } }).env;
    if (env?.platform && env.platform !== "notInDingTalk") return true;
  } catch {
    /* ignore */
  }
  return /DingTalk/i.test(navigator.userAgent);
}

type JsapiConfig = {
  agentId: string;
  corpId: string;
  timeStamp: string;
  nonceStr: string;
  signature: string;
  jsApiList: string[];
  dingerTemplateId: string;
};

let configuredForUrl: string | null = null;

async function ensureJsapiReady(): Promise<JsapiConfig> {
  const url = window.location.href.split("#")[0] ?? window.location.href;
  if (configuredForUrl === url) {
    // still need templateId; re-fetch lightly
  }
  const res = await fetch("/api/dingtalk/jsapi-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json()) as { ok?: boolean; config?: JsapiConfig; error?: string };
  if (!res.ok || !data.config) {
    throw new Error(data.error || "获取钉钉 JSAPI 鉴权失败");
  }

  await new Promise<void>((resolve, reject) => {
    dd.config({
      agentId: data.config!.agentId,
      corpId: data.config!.corpId,
      timeStamp: data.config!.timeStamp,
      nonceStr: data.config!.nonceStr,
      signature: data.config!.signature,
      type: 0,
      jsApiList: data.config!.jsApiList,
    });
    dd.error((err) => {
      reject(new Error(`钉钉 JSAPI 鉴权失败：${JSON.stringify(err)}`));
    });
    // ready 在多数端会回调；给短超时兜底
    const timer = window.setTimeout(() => resolve(), 800);
    try {
      dd.ready(() => {
        window.clearTimeout(timer);
        resolve();
      });
    } catch {
      window.clearTimeout(timer);
      resolve();
    }
  });

  configuredForUrl = url;
  return data.config;
}

/**
 * 在钉钉客户端内调用 A1 发起录音。
 * businessOrder 使用会议 ID，便于回调关联。
 */
export async function startDingTalkA1Recording(opts: {
  meetingId: string;
  templateId?: string;
}): Promise<{ fid?: number; templateId: string }> {
  if (!isDingTalkClient()) {
    throw new Error("请在钉钉客户端内打开本页，才能自动启动 A1 录音");
  }
  const config = await ensureJsapiReady();
  const templateId = (opts.templateId || config.dingerTemplateId || "").trim();
  if (!templateId) {
    throw new Error("请先在团队设置 · 钉钉配置中填写 A1 录音模板 ID（dingerTemplateId）");
  }

  const startDingerRecord = (dd as unknown as {
    biz?: {
      dinger?: {
        startDingerRecord?: (p: {
          templateId: string;
          businessOrder: string;
          success?: (r: { fid?: number }) => void;
          fail?: (e: unknown) => void;
        }) => void;
      };
    };
  }).biz?.dinger?.startDingerRecord;

  // 优先新版 promise API
  try {
    const mod = await import("dingtalk-jsapi/api/union/startDingerRecord");
    const fn = mod.default ?? (mod as { startDingerRecord$?: typeof mod.default }).startDingerRecord$;
    if (typeof fn === "function") {
      const result = (await fn({
        templateId,
        businessOrder: opts.meetingId,
      })) as { fid?: number };
      return { fid: result?.fid, templateId };
    }
  } catch {
    /* fall through to dd.biz */
  }

  if (typeof startDingerRecord !== "function") {
    throw new Error("当前钉钉版本不支持 startDingerRecord，请升级钉钉至 8.2.10+");
  }

  const result = await new Promise<{ fid?: number }>((resolve, reject) => {
    startDingerRecord!({
      templateId,
      businessOrder: opts.meetingId,
      success: (r) => resolve(r ?? {}),
      fail: (e) => reject(new Error(typeof e === "string" ? e : JSON.stringify(e))),
    });
  });
  return { fid: result.fid, templateId };
}
