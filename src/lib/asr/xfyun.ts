import "server-only";

import crypto from "crypto";

const WS_HOST =
  (process.env.XFYUN_RTASR_WS_HOST || "wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1").trim();

export function getXfyunAsrConfig() {
  const appId = (process.env.XFYUN_APP_ID || "").trim();
  const apiKey = (process.env.XFYUN_API_KEY || "").trim();
  const apiSecret = (process.env.XFYUN_API_SECRET || "").trim();
  const lang = (process.env.XFYUN_LANG || "autodialect").trim() || "autodialect";
  const pd = (process.env.XFYUN_PD || "com").trim();
  const vadMdn = (process.env.XFYUN_VAD_MDN || "2").trim();
  return {
    enabled: !!(appId && apiKey && apiSecret),
    appId,
    apiKey,
    apiSecret,
    lang,
    pd: pd || undefined,
    vadMdn: vadMdn === "1" || vadMdn === "2" ? vadMdn : undefined,
    wsHost: WS_HOST,
    sampleRate: 16000,
    frameBytes: 1280,
    frameIntervalMs: 40,
  } as const;
}

/** 文档要求 utc 为北京时间并带 +0800，与容器时区无关 */
function formatUtcChina(d = new Date()): string {
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

function urlEncode(value: string): string {
  return encodeURIComponent(value);
}

/** 生成讯飞实时转写 WebSocket 握手 URL（含 signature） */
export function buildXfyunRealtimeWsUrl(opts: {
  appId: string;
  apiKey: string;
  apiSecret: string;
  lang?: string;
  pd?: string;
  vadMdn?: string;
  uuid: string;
  utc?: string;
}): string {
  const params: Record<string, string> = {
    accessKeyId: opts.apiKey,
    appId: opts.appId,
    lang: opts.lang || "autodialect",
    utc: opts.utc || formatUtcChina(),
    uuid: opts.uuid,
    audio_encode: "pcm_s16le",
    samplerate: "16000",
  };
  if (opts.pd) params.pd = opts.pd;
  if (opts.vadMdn === "1" || opts.vadMdn === "2") params.eng_vad_mdn = opts.vadMdn;

  const sorted = Object.keys(params).sort();
  const baseString = sorted
    .map((k) => `${urlEncode(k)}=${urlEncode(params[k]!)}`)
    .join("&");

  const signature = crypto
    .createHmac("sha1", opts.apiSecret)
    .update(baseString)
    .digest("base64");

  const query = sorted
    .map((k) => `${urlEncode(k)}=${urlEncode(params[k]!)}`)
    .concat(`signature=${urlEncode(signature)}`)
    .join("&");

  const host = WS_HOST.includes("?") ? WS_HOST.split("?")[0]! : WS_HOST;
  return `${host}?${query}`;
}

export type XfyunParsedResult = {
  text: string;
  isFinal: boolean;
  isLastFrame: boolean;
  startMs?: number;
  endMs?: number;
  sessionId?: string;
  error?: string;
};

/** 按 wp 字段拼接词与标点，避免标点单独成行 */
export function extractXfyunText(st: Record<string, unknown>): string {
  const rt = st.rt as Array<{ ws?: Array<{ cw?: Array<{ w?: string; wp?: string }> }> }> | undefined;
  let out = "";
  for (const block of rt ?? []) {
    for (const ws of block.ws ?? []) {
      for (const cw of ws.cw ?? []) {
        const w = cw.w?.trim();
        if (!w) continue;
        out += w;
      }
    }
  }
  return out.replace(/^[\s。，、？！：；,.?!]+/, "").trim();
}

/** 解析讯飞实时转写 JSON 消息 */
export function parseXfyunAsrMessage(raw: string): XfyunParsedResult | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const action = String(j.action ?? "");
  const msgType = String(j.msg_type ?? "");
  const dataTop = j.data as Record<string, unknown> | undefined;

  if (msgType === "action" && dataTop?.action === "started") {
    return {
      text: "",
      isFinal: false,
      isLastFrame: false,
      sessionId:
        typeof dataTop.sessionId === "string"
          ? dataTop.sessionId
          : typeof j.sid === "string"
            ? j.sid
            : undefined,
    };
  }
  if (msgType === "action" && dataTop?.action === "error") {
    return {
      text: "",
      isFinal: false,
      isLastFrame: false,
      error: String(dataTop.desc ?? j.desc ?? j.message ?? "讯飞转写错误"),
    };
  }
  if (action === "started") {
    return {
      text: "",
      isFinal: false,
      isLastFrame: false,
      sessionId: typeof j.sid === "string" ? j.sid : undefined,
    };
  }
  if (action === "error") {
    return {
      text: "",
      isFinal: false,
      isLastFrame: false,
      error: String(j.desc ?? j.message ?? "讯飞转写错误"),
    };
  }

  if (msgType === "result" && j.res_type === "frc") {
    const data = j.data as { desc?: string } | undefined;
    return {
      text: "",
      isFinal: false,
      isLastFrame: false,
      error: data?.desc || "讯飞转写异常",
    };
  }

  const data = j.data as Record<string, unknown> | undefined;
  if (!data?.cn) return null;

  const cn = data.cn as { st?: Record<string, unknown> };
  const st = cn.st;
  if (!st) return null;

  const text = extractXfyunText(st);
  if (!text) return null;
  const typeVal = st.type;
  const isFinal = typeVal === "0" || typeVal === 0;
  const bg = typeof st.bg === "number" ? st.bg : undefined;
  const ed = typeof st.ed === "number" ? st.ed : undefined;

  return {
    text,
    isFinal,
    isLastFrame: data.ls === true,
    startMs: bg,
    endMs: ed,
    sessionId: typeof j.sid === "string" ? j.sid : undefined,
  };
}

