export type TrackingProject = "partner-hub" | "partx" | "browser-bridge" | "script";

export type TrackingEventType =
  | "PAGE_VIEW"
  | "CLICK"
  | "SUBMIT"
  | "SEARCH"
  | "FILTER"
  | "ERROR"
  | "STAY"
  | "SERVER_ACTION";

export type TrackingEvent = {
  project: TrackingProject;
  eventType: TrackingEventType;
  action: string;
  pagePath?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  meta?: Record<string, unknown> | null;
  durationMs?: number | null;
  status?: "SUCCESS" | "FAILED";
};

export type TrackingConfig = {
  project: TrackingProject;
  enabled: boolean;
  debug: boolean;
  batchSize: number;
  flushIntervalMs: number;
  pageViewSampleRate: number;
  clickTrackingEnabled: boolean;
  errorTrackingEnabled: boolean;
  stayTrackingEnabled: boolean;
  maxMetaDepth: number;
  maxMetaSize: number;
  sensitiveKeys: string[];
};

export type TrackerContextValue = {
  track: (event: Omit<TrackingEvent, "project">) => void;
  flush: () => void;
};
