"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { runChannelSyncTick } from "./channel-sync";
import { recordSystemEvent } from "./activity-log";

export async function triggerChannelSyncAction() {
  const user = await requireUser();
  const result = await runChannelSyncTick();

  if (!result.ok && result.error === "SYNC_IN_PROGRESS") {
    return { error: "SYNC_IN_PROGRESS" as const };
  }

  const rowCount =
    (result.backfill?.skipped ? 0 : (result.backfill?.rowCount ?? 0)) +
    (result.daily?.rowCount ?? 0);
  const deletedCount =
    (result.backfill?.skipped ? 0 : (result.backfill?.deletedCount ?? 0)) +
    (result.daily?.deletedCount ?? 0);
  const durationMs =
    (result.backfill?.durationMs ?? 0) + (result.daily?.durationMs ?? 0);

  void recordSystemEvent({
    category: "LEADS",
    action: "channel.sync",
    actorId: user.id,
    actorLabel: user.name,
    summary: result.ok
      ? `Channel 公海同步完成：写入 ${rowCount}，移除 ${deletedCount}`
      : "Channel 公海同步失败",
    status: result.ok ? "SUCCESS" : "FAILED",
    detail: result.error ?? undefined,
    meta: {
      rowCount,
      deletedCount,
      durationMs,
      backfill: result.backfill
        ? {
            rangeStart: result.backfill.rangeStart,
            rangeEnd: result.backfill.rangeEnd,
            rowCount: result.backfill.rowCount,
            deletedCount: result.backfill.deletedCount,
            skipped: result.backfill.skipped ?? false,
            backfillDone: result.backfill.backfillDone ?? false,
          }
        : null,
      daily: result.daily
        ? {
            rangeStart: result.daily.rangeStart,
            rangeEnd: result.daily.rangeEnd,
            rowCount: result.daily.rowCount,
            deletedCount: result.daily.deletedCount,
          }
        : null,
    },
  });

  revalidatePath("/channel");

  if (!result.ok) {
    return { error: result.error ?? "Channel sync failed" };
  }

  return {
    ok: true as const,
    rowCount,
    deletedCount,
    durationMs,
    backfillDone: result.backfill?.backfillDone ?? (result.backfill == null),
    backfillRange:
      result.backfill && !result.backfill.skipped
        ? `${result.backfill.rangeStart} → ${result.backfill.rangeEnd}`
        : null,
    dailyRange: result.daily
      ? `${result.daily.rangeStart} → ${result.daily.rangeEnd}`
      : null,
  };
}
