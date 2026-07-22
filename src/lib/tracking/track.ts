"use client";

import type { TrackingConfig, TrackingEvent, TrackingProject } from "./types";
import { getTrackingConfig } from "./config";

const BEACON_URL = "/api/tracking/beacon";

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(): string {
  try {
    const key = "__ph_tracking_session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = generateSessionId();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return generateSessionId();
  }
}

function sanitizeMeta(value: unknown, config: TrackingConfig, depth: number): unknown {
  if (depth > config.maxMetaDepth) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > config.maxMetaSize) return `${value.slice(0, config.maxMetaSize)}…`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeMeta(v, config, depth + 1));
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (config.sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
        result[key] = "[redacted]";
        continue;
      }
      result[key] = sanitizeMeta(val, config, depth + 1);
    }
    return result;
  }
  return String(value);
}

class TrackingQueue {
  private config: TrackingConfig;
  private queue: TrackingEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private flushPromise: Promise<void> | null = null;

  constructor(project: TrackingProject) {
    this.config = getTrackingConfig(project);
    this.sessionId = getSessionId();
    this.startTimer();
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => this.forceFlush());
      window.addEventListener("beforeunload", () => this.forceFlush());
    }
  }

  track(event: TrackingEvent) {
    if (!this.config.enabled) return;
    if (this.config.debug) {
      console.log("[tracking]", event);
      return;
    }

    const enriched: TrackingEvent = {
      ...event,
      project: this.config.project,
      meta: event.meta ? (sanitizeMeta(event.meta, this.config, 0) as Record<string, unknown> | null) : null,
    };

    this.queue.push(enriched);
    if (this.queue.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  flush() {
    if (this.flushPromise) return this.flushPromise;
    if (this.queue.length === 0) return Promise.resolve();
    this.flushPromise = this.sendBatch().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private forceFlush() {
    const batch = this.queue.splice(0, this.queue.length);
    if (batch.length === 0) return;
    const body = JSON.stringify({ events: batch, sessionId: this.sessionId });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON_URL, new Blob([body], { type: "application/json" }));
      } else {
        void fetch(BEACON_URL, { method: "POST", body, keepalive: true });
      }
    } catch {
      // 丢弃，避免影响主流程
    }
  }

  private async sendBatch() {
    const batch = this.queue.splice(0, this.queue.length);
    if (batch.length === 0) return;
    const body = JSON.stringify({ events: batch, sessionId: this.sessionId });
    try {
      const res = await fetch(BEACON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        console.warn("[tracking] send failed", res.status);
      }
    } catch (e) {
      console.warn("[tracking] send failed", e);
    }
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.config.flushIntervalMs);
  }
}

let globalQueue: TrackingQueue | null = null;

export function initTracking(project: TrackingProject) {
  if (!globalQueue) {
    globalQueue = new TrackingQueue(project);
  }
  return globalQueue;
}

export function trackEvent(project: TrackingProject, event: Omit<TrackingEvent, "project">) {
  const queue = initTracking(project);
  queue.track({ ...event, project });
}

export function flushTracking() {
  void globalQueue?.flush();
}
