import { recordSystemEvent } from "@/lib/activity-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withActionTracking<T extends (...args: any[]) => Promise<any>>(
  actionName: string,
  fn: T,
  options?: {
    targetType?: string;
    extractTargetId?: (args: Parameters<T>) => string | null;
    extractTargetLabel?: (args: Parameters<T>, result: Awaited<ReturnType<T>>) => string | null;
  }
): T {
  return (async (...args: Parameters<T>) => {
    const start = performance.now();
    try {
      const result = await fn(...args);
      void recordSystemEvent({
        category: "SERVER_ACTION",
        action: actionName,
        targetType: options?.targetType ?? null,
        targetId: options?.extractTargetId?.(args) ?? null,
        targetLabel: options?.extractTargetLabel?.(args, result) ?? null,
        status: "SUCCESS",
        durationMs: Math.round(performance.now() - start),
      });
      return result;
    } catch (error) {
      void recordSystemEvent({
        category: "SERVER_ACTION",
        action: actionName,
        status: "FAILED",
        detail: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      });
      throw error;
    }
  }) as T;
}
