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

export class XfyunRelayClient {
  private pcmQueue: number[] = [];
  private sendTimer: number | null = null;
  private sendBusy = false;
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
      void this.flushFrames();
    }, this.session.frameIntervalMs);
    return Promise.resolve();
  }

  pushFloat32(chunk: Float32Array, sampleRate: number) {
    if (this.closed) return;
    const down = downsampleFloat32(chunk, sampleRate, this.session.sampleRate);
    const pcm = floatToPcm16(down);
    for (let i = 0; i < pcm.length; i++) this.pcmQueue.push(pcm[i]!);
  }

  private async flushFrames() {
    if (this.closed || this.sendBusy) return;
    const samplesNeeded = this.session.frameBytes / 2;
    if (this.pcmQueue.length < samplesNeeded) return;

    this.sendBusy = true;
    try {
      const slice = this.pcmQueue.splice(0, samplesNeeded);
      const body = pcm16ToBytes(new Int16Array(slice));
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
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        plain?: string;
        interim?: string;
        sentence?: string;
        startMs?: number;
        endMs?: number;
      };
      if (!res.ok || data.error) {
        this.onError(data.error || res.statusText);
        return;
      }
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
      } else if (data.plain) {
        this.onResult({ text: data.plain, isFinal: false, plain: data.plain });
      }
    } catch (e) {
      if (!this.closed) {
        this.onError(e instanceof Error ? e.message : "音频上传失败");
      }
    } finally {
      this.sendBusy = false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.sendTimer) {
      window.clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    // 发送剩余音频
    if (this.pcmQueue.length) {
      const pcm = new Int16Array(this.pcmQueue);
      this.pcmQueue = [];
      try {
        await fetch(`/api/partner-reviews/${this.meetingId}/recording/xfyun-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Relay-Session": this.session.relaySessionId,
          },
          body: new Blob([Uint8Array.from(pcm16ToBytes(pcm))]),
        });
      } catch {
        /* ignore */
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
  }
}
