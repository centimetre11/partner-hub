"use client";

import { createContext, useContext, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { initTracking } from "./track";
import type { TrackingEvent, TrackingProject } from "./types";
import { getTrackingConfig } from "./config";

type TrackerContextValue = {
  track: (event: Omit<TrackingEvent, "project">) => void;
  flush: () => void;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function TrackerProvider({
  project,
  children,
}: {
  project: TrackingProject;
  children: React.ReactNode;
}) {
  const queueRef = useRef(initTracking(project));
  const pathname = usePathname();
  const config = getTrackingConfig(project);
  const lastClickRef = useRef<string | null>(null);

  const track = useCallback(
    (event: Omit<TrackingEvent, "project">) => {
      queueRef.current.track({ ...event, project });
    },
    [project]
  );

  const flush = useCallback(() => {
    queueRef.current.flush();
  }, []);

  // 路由自动埋点
  useEffect(() => {
    if (!config.enabled || !pathname) return;
    if (Math.random() > config.pageViewSampleRate) return;
    track({
      eventType: "PAGE_VIEW",
      action: "page_viewed",
      pagePath: pathname,
    });
  }, [pathname, track, config.enabled, config.pageViewSampleRate]);

  // 停留时长
  useEffect(() => {
    if (!config.enabled || !config.stayTrackingEnabled || !pathname) return;
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      if (duration > 3000) {
        track({
          eventType: "STAY",
          action: "page_stayed",
          pagePath: pathname,
          durationMs: duration,
        });
      }
    };
  }, [pathname, track, config.enabled, config.stayTrackingEnabled]);

  // 错误捕获
  useEffect(() => {
    if (!config.enabled || !config.errorTrackingEnabled) return;
    const handler = (event: ErrorEvent) => {
      track({
        eventType: "ERROR",
        action: "js_error",
        pagePath: pathname,
        meta: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        status: "FAILED",
      });
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      track({
        eventType: "ERROR",
        action: "unhandled_rejection",
        pagePath: pathname,
        meta: { reason: String(event.reason) },
        status: "FAILED",
      });
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejectionHandler);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, [track, config.enabled, config.errorTrackingEnabled, pathname]);

  // 点击自动埋点（通过 data-track 属性）
  useEffect(() => {
    if (!config.enabled || !config.clickTrackingEnabled) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const clickable = target.closest("[data-track]") as HTMLElement | null;
      if (!clickable) return;
      const action = clickable.getAttribute("data-track");
      if (!action) return;
      const key = `${action}-${Date.now()}`;
      if (lastClickRef.current === key) return;
      lastClickRef.current = key;
      setTimeout(() => (lastClickRef.current = null), 100);
      track({
        eventType: "CLICK",
        action,
        pagePath: pathname,
        targetType: clickable.getAttribute("data-track-type") || clickable.tagName.toLowerCase(),
        targetId: clickable.getAttribute("data-track-id") || null,
        targetLabel: clickable.getAttribute("data-track-label") || clickable.textContent?.slice(0, 50) || null,
      });
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [track, config.enabled, config.clickTrackingEnabled, pathname]);

  return <TrackerContext.Provider value={{ track, flush }}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerContext);
  if (!ctx) {
    return { track: () => {}, flush: () => {} };
  }
  return ctx;
}
