import "server-only";

import { randomUUID } from "crypto";
import WebSocket from "ws";
import { buildXfyunRealtimeWsUrl, getXfyunAsrConfig, parseXfyunAsrMessage } from "./xfyun";
import { appendFinalTranscriptSentence } from "./xfyun-stream-writer";

export type RelaySessionSnapshot = {
  interim: string;
  plain: string;
  lastSentence: string | null;
  error: string | null;
};

type RelaySession = {
  ws: WebSocket;
  meetingId: string;
  userId: string;
  xfyunSessionId: string | null;
  interim: string;
  plain: string;
  lastSentence: string | null;
  error: string | null;
  closed: boolean;
};

const pool = new Map<string, RelaySession>();

function snapshot(s: RelaySession): RelaySessionSnapshot {
  return {
    interim: s.interim,
    plain: s.plain,
    lastSentence: s.lastSentence,
    error: s.error,
  };
}

async function handleMessage(relaySessionId: string, raw: string) {
  const session = pool.get(relaySessionId);
  if (!session || session.closed) return;

  const parsed = parseXfyunAsrMessage(raw);
  if (!parsed) return;

  if (parsed.sessionId) session.xfyunSessionId = parsed.sessionId;

  if (parsed.error) {
    session.error = parsed.error;
    return;
  }

  if (parsed.isFinal && parsed.text) {
    session.interim = "";
    try {
      const res = await appendFinalTranscriptSentence(session.meetingId, {
        text: parsed.text,
        startMs: parsed.startMs,
        endMs: parsed.endMs,
      });
      if (!res.duplicate) {
        session.plain = res.plain;
        session.lastSentence = res.sentence;
      }
    } catch (e) {
      session.error = e instanceof Error ? e.message : String(e);
    }
  } else if (parsed.text) {
    session.interim = parsed.text;
  }
}

export async function createXfyunRelaySession(meetingId: string, userId: string) {
  const cfg = getXfyunAsrConfig();
  if (!cfg.enabled) {
    throw new Error("未配置讯飞转写（XFYUN_APP_ID / API_KEY / API_SECRET）");
  }

  const wsUrl = buildXfyunRealtimeWsUrl({
    appId: cfg.appId,
    apiKey: cfg.apiKey,
    apiSecret: cfg.apiSecret,
    lang: cfg.lang,
    uuid: randomUUID().replace(/-/g, ""),
  });

  const relaySessionId = randomUUID();

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const session: RelaySession = {
      ws,
      meetingId,
      userId,
      xfyunSessionId: null,
      interim: "",
      plain: "",
      lastSentence: null,
      error: null,
      closed: false,
    };
    pool.set(relaySessionId, session);

    let settled = false;

    const timer = setTimeout(() => {
      ws.terminate();
      if (!settled) {
        settled = true;
        reject(new Error("连接讯飞超时，请稍后重试"));
      }
    }, 12_000);

    ws.on("open", () => {
      // 文档：握手成功后即可上传音频；仍等待 started 以拿到 sessionId
    });

    ws.on("message", (data) => {
      const raw = data.toString();
      void handleMessage(relaySessionId, raw);
      if (!settled) {
        const parsed = parseXfyunAsrMessage(raw);
        if (parsed?.error) {
          clearTimeout(timer);
          settled = true;
          reject(new Error(parsed.error));
          return;
        }
        if (parsed?.sessionId) {
          clearTimeout(timer);
          settled = true;
          resolve();
        }
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const msg = err instanceof Error ? err.message : String(err);
      reject(
        new Error(
          `服务器连接讯飞失败（${msg}）。请在讯飞控制台「实时语音转写大模型」服务页关闭 IP 白名单，或将服务器出口 IP 43.164.65.54 加入白名单后重试。`,
        ),
      );
    });

    ws.on("close", () => {
      session.closed = true;
      pool.delete(relaySessionId);
      if (!settled) {
        settled = true;
        reject(new Error("讯飞连接在握手完成前断开"));
      }
    });
  });

  return {
    relaySessionId,
    sampleRate: cfg.sampleRate,
    frameBytes: cfg.frameBytes,
    frameIntervalMs: cfg.frameIntervalMs,
  };
}

export function getRelaySession(relaySessionId: string, meetingId: string, userId: string) {
  const session = pool.get(relaySessionId);
  if (!session || session.meetingId !== meetingId || session.userId !== userId) return null;
  return session;
}

export function sendRelayAudio(relaySessionId: string, meetingId: string, userId: string, pcm: Buffer) {
  const session = getRelaySession(relaySessionId, meetingId, userId);
  if (!session) throw new Error("转写会话已过期，请重新开始录音");
  if (session.closed || session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("讯飞连接已断开");
  }
  if (pcm.length) session.ws.send(pcm);
  const out = snapshot(session);
  if (session.lastSentence) session.lastSentence = null;
  return out;
}

export async function closeXfyunRelaySession(
  relaySessionId: string,
  meetingId: string,
  userId: string,
) {
  const session = getRelaySession(relaySessionId, meetingId, userId);
  if (!session) return;
  session.closed = true;
  try {
    if (session.ws.readyState === WebSocket.OPEN) {
      const sid = session.xfyunSessionId ?? relaySessionId;
      session.ws.send(JSON.stringify({ end: true, sessionId: sid }));
      await new Promise((r) => setTimeout(r, 300));
      session.ws.close();
    }
  } catch {
    /* ignore */
  }
  pool.delete(relaySessionId);
}
