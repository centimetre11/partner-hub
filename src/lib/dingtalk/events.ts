import crypto from "crypto";
import { resolveDingTalkConfig } from "./config";

/**
 * 钉钉事件回调签名校验（HTTP 推送）
 * 企业内部应用：sha1(sort(token, timestamp, nonce, encrypt))
 */
export function verifyDingTalkCallbackSignature(opts: {
  token: string;
  timestamp: string;
  nonce: string;
  encrypt: string;
  signature: string;
}): boolean {
  const arr = [opts.token, opts.timestamp, opts.nonce, opts.encrypt].sort();
  const hash = crypto.createHash("sha1").update(arr.join("")).digest("hex");
  return hash === opts.signature;
}

/** AES 解密钉钉加密消息（EncodingAESKey 为 43 位） */
export function decryptDingTalkEncrypt(aesKey: string, encrypt: string, corpId?: string | null): string {
  const key = Buffer.from(aesKey + "=", "base64");
  const iv = key.subarray(0, 16);
  const encrypted = Buffer.from(encrypt, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const pad = decrypted[decrypted.length - 1]!;
  const content = decrypted.subarray(0, decrypted.length - pad);
  const msgLen = content.readUInt32BE(16);
  const msg = content.subarray(20, 20 + msgLen).toString("utf8");
  if (corpId) {
    const receiveId = content.subarray(20 + msgLen).toString("utf8");
    if (receiveId && receiveId !== corpId) {
      // soft check — some tenants send suiteKey instead
    }
  }
  return msg;
}

export function encryptDingTalkReply(aesKey: string, plain: string, corpId: string): string {
  const key = Buffer.from(aesKey + "=", "base64");
  const iv = key.subarray(0, 16);
  const random = crypto.randomBytes(16);
  const msgBuf = Buffer.from(plain, "utf8");
  const corpBuf = Buffer.from(corpId || "dingtalk", "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length, 0);
  const raw = Buffer.concat([random, lenBuf, msgBuf, corpBuf]);
  const pad = 32 - (raw.length % 32);
  const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

export function signDingTalkReply(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const arr = [token, timestamp, nonce, encrypt].sort();
  return crypto.createHash("sha1").update(arr.join("")).digest("hex");
}

/** A1 官方推荐订阅：dinger_record_finish */
export const DINGER_RECORD_FINISH = "dinger_record_finish";

export type DingTalkEventPayload = {
  EventType?: string;
  eventType?: string;
  syncAction?: string;
  recordId?: string;
  conferenceId?: string;
  spaceId?: string;
  fileId?: string;
  fileName?: string;
  userId?: string;
  userid?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export function parseDingTalkEventJson(raw: string): DingTalkEventPayload {
  try {
    return JSON.parse(raw) as DingTalkEventPayload;
  } catch {
    return {};
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function pickNested(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = asString(obj[key]);
    if (v) return v;
  }
  return undefined;
}

/** 从 A1 / 录音 / 钉盘事件中提取录音与文件引用 */
export function extractRecordingRefs(event: DingTalkEventPayload): {
  recordId?: string;
  conferenceId?: string;
  spaceId?: string;
  fileId?: string;
  fileName?: string;
  userId?: string;
  /** startDingerRecord 传入的业务单号（我们用会议 ID） */
  businessOrder?: string;
  eventName: string;
} {
  const eventName = String(event.EventType ?? event.eventType ?? event.syncAction ?? "").trim();
  const data = (event.data && typeof event.data === "object" ? event.data : undefined) as
    | Record<string, unknown>
    | undefined;
  const payload = (event.payload && typeof event.payload === "object" ? event.payload : undefined) as
    | Record<string, unknown>
    | undefined;
  const openConf = (data?.openConfModel ?? event.openConfModel) as { conferenceId?: string } | undefined;
  const biz = (data ?? payload ?? event) as Record<string, unknown>;

  return {
    eventName,
    recordId:
      asString(event.recordId) ||
      pickNested(data, ["recordId", "record_id", "dingerRecordId"]) ||
      pickNested(payload, ["recordId", "record_id"]) ||
      pickNested(biz, ["recordId", "record_id"]),
    conferenceId:
      openConf?.conferenceId ||
      asString(event.conferenceId) ||
      pickNested(data, ["conferenceId"]) ||
      undefined,
    spaceId:
      asString(event.spaceId) ||
      pickNested(data, ["spaceId", "space_id"]) ||
      pickNested(payload, ["spaceId", "space_id"]) ||
      pickNested(biz, ["spaceId", "space_id"]),
    fileId:
      asString(event.fileId) ||
      pickNested(data, ["fileId", "file_id", "dentryId", "markdownFileId", "textFileId", "transcriptFileId"]) ||
      pickNested(payload, ["fileId", "file_id", "dentryId", "markdownFileId", "textFileId"]) ||
      pickNested(biz, ["fileId", "file_id", "dentryId", "markdownFileId", "textFileId"]),
    fileName:
      asString(event.fileName) ||
      pickNested(data, ["fileName", "file_name", "name"]) ||
      pickNested(payload, ["fileName", "name"]),
    businessOrder:
      pickNested(data, ["businessOrder", "business_order", "bizOrder", "outOrderId", "outBizNo"]) ||
      pickNested(payload, ["businessOrder", "business_order", "bizOrder", "outOrderId", "outBizNo"]) ||
      pickNested(biz, ["businessOrder", "business_order", "bizOrder", "outOrderId", "outBizNo"]),
    userId:
      asString(event.userId) ||
      asString(event.userid) ||
      pickNested(data, ["userId", "userid", "staffId"]) ||
      pickNested(payload, ["userId", "userid"]),
  };
}

export async function getDingTalkCallbackSecrets() {
  const config = await resolveDingTalkConfig();
  // 企业内部应用事件推送：OWNER_KEY = Client ID（原 AppKey），不是 CorpId
  return {
    token: config?.token ?? "",
    aesKey: config?.aesKey ?? "",
    corpId: config?.corpId ?? "",
    appKey: config?.appKey ?? "",
    ownerKey: config?.appKey?.trim() || config?.corpId?.trim() || "dingtalk",
  };
}

/** 钉钉事件订阅要求：始终返回加密后的 success JSON */
export function buildDingTalkSuccessReply(opts: {
  token: string;
  aesKey: string;
  ownerKey: string;
  timestamp?: string;
  nonce?: string;
}) {
  const timeStamp = opts.timestamp || String(Date.now());
  const nonce = opts.nonce || Math.random().toString(36).slice(2, 10);
  const encrypt = encryptDingTalkReply(opts.aesKey, "success", opts.ownerKey);
  const msg_signature = signDingTalkReply(opts.token, timeStamp, nonce, encrypt);
  return { msg_signature, timeStamp, nonce, encrypt };
}

/**
 * 是否为录音/转写/听记完成类事件。
 * 控制台「DingTalkA1听记变更」「小助理总结完成」以及 flash_minutes / dinger_record_finish 等均纳入。
 */
export function isRecordingCompleteEvent(event: DingTalkEventPayload): boolean {
  const type = String(event.EventType ?? event.eventType ?? event.syncAction ?? "").toLowerCase();
  const minutesEventType = String(
    (event as { minutesEventType?: string }).minutesEventType ??
      (event.data as { minutesEventType?: string } | undefined)?.minutesEventType ??
      "",
  ).toLowerCase();

  if (!type) {
    // 部分推送把业务字段放在顶层，无 EventType
    return !!(event.recordId || event.fileId || (event.data && typeof event.data === "object"));
  }

  // 设备状态变更等噪音事件跳过
  if (type.includes("device_status") || type.includes("assistant_status") || type.includes("agent_")) {
    return false;
  }

  if (
    minutesEventType.includes("summary") ||
    minutesEventType.includes("generated") ||
    minutesEventType.includes("finish")
  ) {
    return true;
  }

  return (
    type === DINGER_RECORD_FINISH ||
    type.includes("dinger_record") ||
    type.includes("dinger") ||
    type.includes("record_finish") ||
    type.includes("flash_minutes") ||
    type.includes("listen") || // 听记
    type.includes("tingji") ||
    type.includes("minutes") ||
    type.includes("summary") ||
    type.includes("asr") ||
    type.includes("cloud_record") ||
    type.includes("a1") ||
    type.includes("storage_dentry") ||
    type.includes("file_add") ||
    type.includes("ding_drive") ||
    // 宽匹配「听记变更」类英文名
    (type.includes("record") && !type.includes("status"))
  );
}
