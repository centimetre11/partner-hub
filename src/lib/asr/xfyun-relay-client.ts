import {
  downsampleFloat32,
  floatToPcm16,
  pcm16ToBytes,
} from "./wav";

export type RelayClientResult = {
  text: string;
  isFinal: boolean;
  plain?: string;
  startMs?: number;
  endMs?: number;
  error?: string;
};

export type XfyunRelaySessionInfo = {
  relaySessionId: string;
  sampleRate: number;
  frameBytes: number;
  frameIntervalMs: number;
};

/** 每次 HTTP 上传的音频帧数（1280B/帧），减少往返次数 */
const FRAMES_PER_UPLOAD = 12;

export class XfyunRelayClient {
  private pcmQueue: number[] = [];
  private sendTimer: number | null = null;
  private sendChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private meetingId: string,
    private session: XfyunRelaySessionInfo,
    private onResult: (r: RelayClientResult) => void,
    private onError: (msg: string) => void,
  ) {}

  /** 服务端 relay 已在开录时建立，此处仅启动发送循环 */
  connect(): Promise<void> {
    this.sendTimer = window.setInterval(() => {
      this.sendChain = this.sendChain.then(() => this.flushFrames());
    }, this.session.frameIntervalMs);
    return Promise.resolve();
  }

  pushFloat32(chunk: Float32Array, sampleRate: number) {
    if (this.closed) return;
    const down = downsampleFloat32(chunk, sampleRate, this.session.sampleRate);
    const pcm = floatToPcm16(down);
    for (let i = 0; i < pcm.length; i++) this.pcmQueue.push(pcm[i]!);
  }

  private samplesPerFrame() {
    return this.session.frameBytes / 2;
  }

  private async postPcm(body: Uint8Array) {
    const res = await fetch(
      `/api/partner-reviews/${this.meetingId}/recording/xfyun-audio`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Relay-Session": this.session.relaySessionId,
        },
        body: new Blob([Uint8Array.from(body)]),
      },
    );
    const raw = await res.text();
    let data: {
      ok?: boolean;
      error?: string;
      plain?: string;
      interim?: string;
      sentence?: string;
      startMs?: number;
      endMs?: number;
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      const hint =
        res.status === 502 || res.status === 504
          ? "服务器网关超时，请刷新页面后重新开始录音"
          : raw.includes("Server Action")
            ? "页面版本过旧，请强制刷新（Cmd+Shift+R）后重试"
            : `服务器返回异常（HTTP ${res.status}），请刷新后重试`;
      this.onError(hint);
      return;
    }
    if (!res.ok || data.error) {
      this.onError(data.error || res.statusText);
      return;
    }
    this.applyResult(data);
  }

  private applyResult(data: {
    plain?: string;
    interim?: string;
    sentence?: string;
    startMs?: number;
    endMs?: number;
  }) {
    if (data.interim) {
      this.onResult({ text: data.interim, isFinal: false, plain: data.plain });
    }
    if (data.sentence) {
      this.onResult({
        text: data.sentence,
        isFinal: true,
        plain: data.plain,
        startMs: data.startMs,
        endMs: data.endMs,
      });
    } else if (data.plain && !data.interim) {
      this.onResult({ text: data.plain, isFinal: false, plain: data.plain });
    }
  }

  private async flushFrames() {
    if (this.closed) return;
    const samplesNeeded = this.samplesPerFrame();
    const maxSamples = samplesNeeded * FRAMES_PER_UPLOAD;
    if (this.pcmQueue.length < samplesNeeded) return;

    const take = Math.min(this.pcmQueue.length, maxSamples);
    const takeAligned = Math.floor(take / samplesNeeded) * samplesNeeded;
    if (takeAligned < samplesNeeded) return;

    const slice = this.pcmQueue.splice(0, takeAligned);
    const body = pcm16ToBytes(new Int16Array(slice));
    try {
      await this.postPcm(body);
    } catch (e) {
      if (!this.closed) {
        this.onError(e instanceof Error ? e.message : "音频上传失败");
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.sendTimer) {
      window.clearInterval(this.sendTimer);
      this.sendTimer = null;
    }

    await this.sendChain.catch(() => undefined);

    const samplesNeeded = this.samplesPerFrame();
    const deadline = Date.now() + 4000;
    while (this.pcmQueue.length >= samplesNeeded && Date.now() < deadline) {
      const take = Math.min(
        this.pcmQueue.length,
        samplesNeeded * FRAMES_PER_UPLOAD,
      );
      const takeAligned = Math.floor(take / samplesNeeded) * samplesNeeded;
      const slice = this.pcmQueue.splice(0, takeAligned);
      try {
        await this.postPcm(pcm16ToBytes(new Int16Array(slice)));
      } catch {
        break;
      }
    }

    try {
      await fetch(`/api/partner-reviews/${this.meetingId}/recording/xfyun-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relaySessionId: this.session.relaySessionId }),
      });
    } catch {
      /* ignore */
    }
    this.pcmQueue = [];
  }
}
