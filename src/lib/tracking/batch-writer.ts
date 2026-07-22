import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type BatchItem = {
  table: "userBehaviorLog" | "systemEventLog";
  data: Record<string, unknown>;
};

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 3000;

const queue: BatchItem[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let flushPromise: Promise<void> | null = null;

function startTimer() {
  if (timer) return;
  timer = setInterval(() => void flushBatch(), FLUSH_INTERVAL_MS);
}

export async function flushBatch() {
  if (flushPromise) return flushPromise;
  if (queue.length === 0) return Promise.resolve();
  flushPromise = (async () => {
    const batch = queue.splice(0, queue.length);
    try {
      const behavior = batch
        .filter((b) => b.table === "userBehaviorLog")
        .map((b) => b.data as Prisma.UserBehaviorLogCreateManyInput);
      const system = batch
        .filter((b) => b.table === "systemEventLog")
        .map((b) => b.data as Prisma.SystemEventLogCreateManyInput);
      if (behavior.length) await db.userBehaviorLog.createMany({ data: behavior });
      if (system.length) await db.systemEventLog.createMany({ data: system });
    } catch (e) {
      console.error("[batch-writer] flush failed:", e);
    } finally {
      flushPromise = null;
    }
  })();
  return flushPromise;
}

export function enqueueLog(table: "userBehaviorLog" | "systemEventLog", data: Record<string, unknown>) {
  queue.push({ table, data });
  if (queue.length >= BATCH_SIZE) {
    void flushBatch();
  } else {
    startTimer();
  }
}
