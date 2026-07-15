import "server-only";

import crypto from "crypto";

const WS_HOST =
  (process.env.XFYUN_RTASR_WS_HOST || "wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1").trim();

export function getXfyunAsrConfig() {
  const appId = (process.env.XFYUN_APP_ID || "").trim();
  const apiKey = (process.env.XFYUN_API_KEY || "").trim();
  const apiSecret = (process.env.XFYUN_API_SECRET || "").trim();
  const lang = (process.env.XFYUN_LANG || "autodialect").trim() || "autodialect";
  return {
    enabled: !!(appId && apiKey && apiSecret),
    appId,
    apiKey,
    apiSecret,
    lang,
    wsHost: WS_HOST,
    sampleRate: 16000,
    frameBytes: 1280,
    frameIntervalMs: 40,
  } as const;
}

function formatUtcChina(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // 讯飞要求 +0800 格式
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+0800`;
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

  const words: string[] = [];
  const rt = st.rt as Array<{ ws?: Array<{ cw?: Array<{ w?: string }> }> }> | undefined;
  for (const block of rt ?? []) {
    for (const ws of block.ws ?? []) {
      for (const cw of ws.cw ?? []) {
        if (cw.w) words.push(cw.w);
      }
    }
  }

  const text = words.join("").trim();
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
