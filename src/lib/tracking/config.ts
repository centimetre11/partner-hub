import type { TrackingConfig, TrackingProject } from "./types";

export function getTrackingConfig(project: TrackingProject): TrackingConfig {
  return {
    project,
    enabled: process.env.NEXT_PUBLIC_TRACKING_ENABLED !== "false",
    debug: process.env.NEXT_PUBLIC_TRACKING_DEBUG === "true",
    batchSize: 20,
    flushIntervalMs: 5000,
    pageViewSampleRate: parseFloat(process.env.NEXT_PUBLIC_TRACKING_PAGE_SAMPLE_RATE ?? "1"),
    clickTrackingEnabled: process.env.NEXT_PUBLIC_TRACKING_CLICK_ENABLED !== "false",
    errorTrackingEnabled: process.env.NEXT_PUBLIC_TRACKING_ERROR_ENABLED !== "false",
    stayTrackingEnabled: process.env.NEXT_PUBLIC_TRACKING_STAY_ENABLED !== "false",
    maxMetaDepth: 4,
    maxMetaSize: 2000,
    sensitiveKeys: [
      "password",
      "token",
      "secret",
      "authorization",
      "apikey",
      "api_key",
      "api-key",
      "content",
      "body",
      "credential",
      "private_key",
      "privatekey",
    ],
  };
}
