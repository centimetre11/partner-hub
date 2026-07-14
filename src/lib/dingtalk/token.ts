import { resolveDingTalkConfig, isDingTalkConfigured } from "./config";

type TokenCache = { token: string; expiresAt: number };
let cache: TokenCache | null = null;

/** 获取钉钉 access_token（带内存缓存） */
export async function getDingTalkAccessToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 60_000) {
    return cache.token;
  }

  const config = await resolveDingTalkConfig();
  if (!isDingTalkConfigured(config)) {
    throw new Error("钉钉未配置或已禁用");
  }

  const url = new URL("https://oapi.dingtalk.com/gettoken");
  url.searchParams.set("appkey", config.appKey);
  url.searchParams.set("appsecret", config.appSecret);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const data = (await res.json()) as { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };
  if (!res.ok || data.errcode !== 0 || !data.access_token) {
    throw new Error(`钉钉 gettoken 失败: ${data.errmsg ?? res.statusText}`);
  }

  cache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  return data.access_token;
}

export function clearDingTalkTokenCache() {
  cache = null;
}
