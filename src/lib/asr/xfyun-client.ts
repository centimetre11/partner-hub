import {
  downsampleFloat32,
  floatToPcm16,
  pcm16ToBytes,
} from "./wav";

export type XfyunClientResult = {
  text: string;
  isFinal: boolean;
  isLastFrame: boolean;
  startMs?: number;
  endMs?: number;
  sessionId?: string;
  error?: string;
};

function parseMessage(raw: string): XfyunClientResult | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const msgType = String(j.msg_type ?? "");
    const action = String(j.action ?? "");
    const dataObj = j.data as Record<string, unknown> | undefined;

    if (msgType === "action" && dataObj?.action === "started") {
      return {
        text: "",
        isFinal: false,
        isLastFrame: false,
        sessionId:
          typeof dataObj.sessionId === "string"
            ? dataObj.sessionId
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
    if (action === "error" || (msgType === "action" && dataObj?.action === "error")) {
      return {
        text: "",
        isFinal: false,
        isLastFrame: false,
        error: String(j.desc ?? dataObj?.desc ?? j.message ?? "讯飞转写错误"),
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
    const st = (data.cn as { st?: Record<string, unknown> }).st;
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

    const typeVal = st.type;
    return {
      text: words.join("").trim(),
      isFinal: typeVal === "0" || typeVal === 0,
      isLastFrame: data.ls === true,
      startMs: typeof st.bg === "number" ? st.bg : undefined,
      endMs: typeof st.ed === "number" ? st.ed : undefined,
      sessionId: typeof j.sid === "string" ? j.sid : undefined,
    };
  } catch {
    return null;
  }
}

export type XfyunRealtimeSession = {
  wsUrl: string;
  sessionId: string;
  sampleRate: number;
  frameBytes: number;
  frameIntervalMs: number;
};

export class XfyunRealtimeClient {
  private ws: WebSocket | null = null;
  private sendTimer: number | null = null;
  private pcmQueue: number[] = [];
  private nativeRate = 48000;
  private sessionId: string;
  private serverSid: string | null = null;
  private closed = false;

  constructor(
    private session: XfyunRealtimeSession,
    private onResult: (r: XfyunClientResult) => void,
    private onError: (msg: string) => void,
  ) {
    this.sessionId = session.sessionId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.ws = new WebSocket(this.session.wsUrl);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.sendTimer = window.setInterval(() => this.flushFrames(), this.session.frameIntervalMs);
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      this.ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        const parsed = parseMessage(ev.data);
        if (!parsed) return;
        if (parsed.sessionId) this.serverSid = parsed.sessionId;
        if (parsed.error) {
          this.onError(parsed.error);
          return;
        }
        if (parsed.text || parsed.isFinal || parsed.isLastFrame) {
          this.onResult(parsed);
        }
      };

      this.ws.onerror = () => {
        if (!this.closed) {
          this.onError("讯飞 WebSocket 连接失败，请检查密钥或控制台 IP 白名单");
        }
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket error"));
        }
      };

      this.ws.onclose = (ev) => {
        if (this.sendTimer) window.clearInterval(this.sendTimer);
        this.sendTimer = null;
        if (!settled && !this.closed) {
          settled = true;
          reject(new Error(`讯飞连接已关闭（${ev.code}）`));
        }
      };
    });
  }

  pushFloat32(chunk: Float32Array, sampleRate: number) {
    if (this.closed) return;
    this.nativeRate = sampleRate;
    const down = downsampleFloat32(chunk, sampleRate, this.session.sampleRate);
    const pcm = floatToPcm16(down);
    for (let i = 0; i < pcm.length; i++) {
      this.pcmQueue.push(pcm[i]!);
    }
  }

  private flushFrames() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const samplesNeeded = this.session.frameBytes / 2;
    while (this.pcmQueue.length >= samplesNeeded) {
      const slice = this.pcmQueue.splice(0, samplesNeeded);
      const pcm = new Int16Array(slice);
      this.ws.send(pcm16ToBytes(pcm));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.sendTimer) {
      window.clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    // 发送剩余音频
    if (this.pcmQueue.length && this.ws?.readyState === WebSocket.OPEN) {
      const pcm = new Int16Array(this.pcmQueue);
      this.pcmQueue = [];
      this.ws.send(pcm16ToBytes(pcm));
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      const sid = this.serverSid || this.sessionId;
      this.ws.send(JSON.stringify({ end: true, sessionId: sid }));
      await new Promise((r) => setTimeout(r, 400));
      this.ws.close();
    }
    this.ws = null;
  }
}
