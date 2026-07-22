import { NextRequest } from "next/server";
import { recordSystemEvent } from "@/lib/activity-log";

type NextHandler = (req: NextRequest) => Promise<Response> | Response;

export function withApiTracking(routeName: string, handler: NextHandler): NextHandler {
  return async (req: NextRequest) => {
    const start = performance.now();
    try {
      const res = await handler(req);
      void recordSystemEvent({
        category: "API",
        action: routeName,
        summary: `${req.method} ${req.nextUrl.pathname}`,
        status: res.ok ? "SUCCESS" : "FAILED",
        durationMs: Math.round(performance.now() - start),
      });
      return res;
    } catch (error) {
      void recordSystemEvent({
        category: "API",
        action: routeName,
        summary: `${req.method} ${req.nextUrl.pathname}`,
        status: "FAILED",
        detail: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      });
      throw error;
    }
  };
}
