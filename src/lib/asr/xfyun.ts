import "server-only";

import crypto from "crypto";

const API_HOST = (
  process.env.XFYUN_IFASR_HOST || "https://office-api-ist-dx.iflyaisol.com"
).trim();

export function getXfyunAsrConfig() {
  const appId = (process.env.XFYUN_APP_ID || "").trim();
  const apiKey = (process.env.XFYUN_API_KEY || "").trim();
  const apiSecret = (process.env.XFYUN_API_SECRET || "").trim();
  const language = (process.env.XFYUN_LANG || "autodialect").trim() || "autodialect";
  const pd = (process.env.XFYUN_PD || "com").trim();
  const vadMdn = (process.env.XFYUN_VAD_MDN || "2").trim();
  return {
    enabled: !!(appId && apiKey && apiSecret),
    appId,
    apiKey,
    apiSecret,
    language,
    /** @deprecated 兼容旧字段名；请用 language */
    lang: language,
    pd: pd || undefined,
    vadMdn: vadMdn === "1" || vadMdn === "2" ? vadMdn : undefined,
    apiHost: API_HOST.replace(/\/$/, ""),
  } as const;
}

/** 文档要求 dateTime 为本地时间并带时区偏移，东八区 +0800 */
export function formatDateTimeChina(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+0800`;
}

/** 对齐 Java URLEncoder：空格为 +，其余按百分号编码 */
function urlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * 录音文件转写大模型签名（HMAC-SHA1）。
 * 与官方 Java 示例一致：按 key 自然排序，跳过 signature / 空值，仅对 value 做 URL 编码。
 */
export function signXfyunParams(
  accessKeySecret: string,
  queryParam: Record<string, string | undefined | null>,
): string {
  const keys = Object.keys(queryParam)
    .filter((k) => k !== "signature")
    .sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = queryParam[key];
    if (value == null || value === "") continue;
    parts.push(`${key}=${urlEncode(value)}`);
  }
  const baseString = parts.join("&");
  return crypto.createHmac("sha1", accessKeySecret).update(baseString).digest("base64");
}

export function buildSignedQuery(opts: {
  apiSecret: string;
  params: Record<string, string | undefined | null>;
}): { query: string; signature: string } {
  const signature = signXfyunParams(opts.apiSecret, opts.params);
  const keys = Object.keys(opts.params)
    .filter((k) => k !== "signature")
    .sort();
  const query = keys
    .filter((k) => {
      const v = opts.params[k];
      return v != null && v !== "";
    })
    .map((k) => `${urlEncode(k)}=${urlEncode(opts.params[k]!)}`)
    .join("&");
  return { query, signature };
}

export function randomSignatureId(len = 16): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** 按 wp 字段拼接词与标点 */
export function extractXfyunText(st: Record<string, unknown>): string {
  const rt = st.rt as Array<{ ws?: Array<{ cw?: Array<{ w?: string; wp?: string }> }> }> | undefined;
  let out = "";
  for (const block of rt ?? []) {
    for (const ws of block.ws ?? []) {
      for (const cw of ws.cw ?? []) {
        const w = cw.w?.trim();
        if (!w) continue;
        // g=分段标记，无实际文本
        if (cw.wp === "g") continue;
        out += w;
      }
    }
  }
  return out.replace(/^[\s。，、？！：；,.?!]+/, "").trim();
}

export type IfasrLatticeSentence = {
  text: string;
  startMs: number;
  endMs: number;
  role?: string;
};

/** 解析 getResult 返回的 orderResult（lattice JSON 字符串） */
export function parseIfasrOrderResult(orderResult: string): IfasrLatticeSentence[] {
  let root: { lattice?: Array<{ json_1best?: string }>; lattice2?: Array<{ json_1best?: string }> };
  try {
    root = JSON.parse(orderResult) as typeof root;
  } catch {
    return [];
  }
  const lattice = root.lattice?.length ? root.lattice : root.lattice2 ?? [];
  const sentences: IfasrLatticeSentence[] = [];
  for (const item of lattice) {
    if (!item?.json_1best) continue;
    let best: { st?: Record<string, unknown> };
    try {
      best = JSON.parse(item.json_1best) as typeof best;
    } catch {
      continue;
    }
    const st = best.st;
    if (!st) continue;
    const text = extractXfyunText(st);
    if (!text) continue;
    const bg = Number(st.bg);
    const ed = Number(st.ed);
    sentences.push({
      text,
      startMs: Number.isFinite(bg) ? bg : 0,
      endMs: Number.isFinite(ed) ? ed : Number.isFinite(bg) ? bg : 0,
      role: typeof st.rl === "string" ? st.rl : undefined,
    });
  }
  return sentences;
}

export const IFASR_FAIL_TYPE: Record<number, string> = {
  0: "音频正常",
  1: "音频上传失败",
  2: "音频转码失败",
  3: "音频识别失败",
  4: "音频时长超限（最长 5 小时）",
  5: "音频校验失败（duration 与真实时长不符）",
  6: "静音文件",
  7: "翻译失败",
  8: "账号无翻译权限",
  9: "转写质检失败",
  99: "其他错误",
};
