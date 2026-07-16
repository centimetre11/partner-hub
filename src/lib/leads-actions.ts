"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { syncLeadsData } from "./leads-sync";
import { recordSystemEvent } from "./activity-log";

export async function triggerLeadsSyncAction() {
  const user = await requireUser();
  const result = await syncLeadsData();

  if (!result.ok && result.error === "SYNC_IN_PROGRESS") {
    return { error: "SYNC_IN_PROGRESS" as const };
  }

  void recordSystemEvent({
    category: "LEADS",
    action: "leads.sync",
    actorId: user.id,
    actorLabel: user.name,
    summary: result.ok
      ? `线索同步完成：${result.leadCount} 条`
      : "线索同步失败",
    status: result.ok ? "SUCCESS" : "FAILED",
    detail: result.error ?? undefined,
    meta: {
      leadCount: result.leadCount,
      durationMs: result.durationMs,
    },
  });

  revalidatePath("/leads");

  if (!result.ok) {
    return { error: result.error ?? "Leads sync failed" };
  }

  return {
    ok: true as const,
    leadCount: result.leadCount,
    durationMs: result.durationMs,
  };
}
