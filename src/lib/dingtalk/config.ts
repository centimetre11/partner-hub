import { db } from "../db";

export type DingTalkConfig = {
  corpId: string | null;
  appKey: string;
  appSecret: string;
  token: string | null;
  aesKey: string | null;
  agentId: string | null;
  dingerTemplateId: string | null;
  enabled: boolean;
};

export type DingTalkConfigForClient = {
  configured: boolean;
  enabled: boolean;
  corpId: string;
  appKey: string;
  appKeyTail: string;
  hasAppSecret: boolean;
  token: string;
  hasAesKey: boolean;
  agentId: string;
  dingerTemplateId: string;
  updatedAt?: string;
  callbackHint: string;
};

function configFromEnv(): DingTalkConfig | null {
  const appKey = process.env.DINGTALK_APP_KEY?.trim();
  const appSecret = process.env.DINGTALK_APP_SECRET?.trim();
  if (!appKey || !appSecret) return null;
  return {
    corpId: process.env.DINGTALK_CORP_ID?.trim() || null,
    appKey,
    appSecret,
    token: process.env.DINGTALK_TOKEN?.trim() || null,
    aesKey: process.env.DINGTALK_AES_KEY?.trim() || null,
    agentId: process.env.DINGTALK_AGENT_ID?.trim() || null,
    dingerTemplateId: process.env.DINGTALK_DINGER_TEMPLATE_ID?.trim() || null,
    enabled: process.env.DINGTALK_ENABLED !== "false",
  };
}

export async function resolveDingTalkConfig(): Promise<DingTalkConfig | null> {
  const row = await db.systemDingTalkConfig.findUnique({ where: { id: "singleton" } });
  if (row?.appKey?.trim() && row.appSecret?.trim()) {
    return {
      corpId: row.corpId?.trim() || null,
      appKey: row.appKey.trim(),
      appSecret: row.appSecret,
      token: row.token?.trim() || null,
      aesKey: row.aesKey?.trim() || null,
      agentId: row.agentId?.trim() || null,
      dingerTemplateId: row.dingerTemplateId?.trim() || process.env.DINGTALK_DINGER_TEMPLATE_ID?.trim() || null,
      enabled: row.enabled,
    };
  }
  return configFromEnv();
}

export async function getDingTalkConfigForClient(): Promise<DingTalkConfigForClient> {
  const row = await db.systemDingTalkConfig.findUnique({ where: { id: "singleton" } });
  const resolved = await resolveDingTalkConfig();
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "") || "";
  return {
    configured: !!resolved,
    enabled: resolved?.enabled ?? true,
    corpId: row?.corpId?.trim() || process.env.DINGTALK_CORP_ID?.trim() || "",
    appKey: row?.appKey?.trim() || process.env.DINGTALK_APP_KEY?.trim() || "",
    appKeyTail: resolved?.appKey ? resolved.appKey.slice(-4) : "",
    hasAppSecret: !!resolved?.appSecret,
    token: row?.token?.trim() || process.env.DINGTALK_TOKEN?.trim() || "",
    hasAesKey: !!(row?.aesKey?.trim() || process.env.DINGTALK_AES_KEY?.trim()),
    agentId: row?.agentId?.trim() || process.env.DINGTALK_AGENT_ID?.trim() || "",
    dingerTemplateId:
      row?.dingerTemplateId?.trim() || process.env.DINGTALK_DINGER_TEMPLATE_ID?.trim() || "",
    updatedAt: row?.updatedAt?.toISOString(),
    callbackHint: baseUrl ? `${baseUrl}/api/dingtalk/callback` : "/api/dingtalk/callback",
  };
}

export function isDingTalkConfigured(config: DingTalkConfig | null): config is DingTalkConfig {
  return !!config?.appKey && !!config.appSecret && config.enabled !== false;
}
