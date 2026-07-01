import { db } from "./db";
import { syncBusinessRecordToCrm, type CrmBusinessRecordSyncResult } from "./crm-business-record";
import { type OwnerRef, ownerData } from "./owner";

export const BUSINESS_RECORD_CATEGORIES = [
  "VISIT",
  "TRAINING",
  "NEGOTIATION",
  "DELIVERY",
  "RELATIONSHIP",
  "OTHER",
] as const;

export type BusinessRecordCategory = (typeof BUSINESS_RECORD_CATEGORIES)[number];

export function normalizeBusinessRecordCategory(raw: string): BusinessRecordCategory {
  return BUSINESS_RECORD_CATEGORIES.includes(raw as BusinessRecordCategory) ? (raw as BusinessRecordCategory) : "OTHER";
}

export type BusinessRecordCrmSyncStatus = "SYNCED" | "FAILED" | "SKIPPED" | "PARTIAL";

export type BusinessRecordCrmSyncDisplay = {
  status: "SYNCED" | "FAILED" | "SKIPPED" | "PENDING";
  reason?: string;
  syncedAt?: Date;
};

export function resolveBusinessRecordCrmSync(record: {
  crmSyncStatus?: string | null;
  crmSyncedAt?: Date | string | null;
  crmSyncError?: string | null;
}): BusinessRecordCrmSyncDisplay {
  const syncedAt = record.crmSyncedAt ? new Date(record.crmSyncedAt) : undefined;
  if (record.crmSyncStatus === "PARTIAL") {
    return { status: "FAILED", reason: record.crmSyncError ?? "部分 CRM 同步失败", syncedAt };
  }
  if (record.crmSyncStatus === "FAILED") {
    return { status: "FAILED", reason: record.crmSyncError ?? undefined };
  }
  if (record.crmSyncStatus === "SKIPPED") {
    return { status: "SKIPPED", reason: record.crmSyncError ?? undefined };
  }
  if (record.crmSyncStatus === "SYNCED" || syncedAt) {
    return { status: "SYNCED", syncedAt };
  }
  if (record.crmSyncError) {
    return { status: "FAILED", reason: record.crmSyncError };
  }
  return { status: "PENDING" };
}

export async function persistBusinessRecord(opts: {
  owner: OwnerRef;
  userId: string;
  category: string;
  title: string;
  content?: string | null;
  occurredAt: Date;
  contactId?: string | null;
  source: string;
  sourceTodoId?: string | null;
  traceNature?: string | null;
  traceAction?: string | null;
  crmRecorderUserIds?: string[];
}) {
  const category = normalizeBusinessRecordCategory(opts.category);
  const owner = ownerData(opts.owner);
  const event = await db.timelineEvent.create({
    data: {
      ...owner,
      type: "MILESTONE",
      title: opts.title,
      content: opts.content,
      createdById: opts.userId,
      createdAt: opts.occurredAt,
      meta: JSON.stringify({ category, source: opts.source }),
    },
  });

  const record = await db.businessRecord.create({
    data: {
      ...owner,
      category,
      title: opts.title,
      content: opts.content,
      crmTraceNature: opts.traceNature?.trim() || null,
      crmTraceAction: opts.traceAction?.trim() || null,
      occurredAt: opts.occurredAt,
      contactId: opts.contactId,
      timelineEventId: event.id,
      sourceTodoId: opts.sourceTodoId,
      source: opts.source,
      createdById: opts.userId,
      crmRecorderUserIds: opts.crmRecorderUserIds?.length ? JSON.stringify(opts.crmRecorderUserIds) : null,
    },
  });

  if (opts.sourceTodoId) {
    await db.todoItem.update({
      where: { id: opts.sourceTodoId },
      data: { status: "DONE", doneAt: new Date() },
    });
  }

  let crmSync: CrmBusinessRecordSyncResult;
  try {
    crmSync = await syncBusinessRecordToCrm({
      recordId: record.id,
      owner: opts.owner,
      userId: opts.userId,
      recorderUserIds: opts.crmRecorderUserIds,
      category,
      title: opts.title,
      content: opts.content,
      occurredAt: opts.occurredAt,
      contactId: opts.contactId,
      traceNature: opts.traceNature,
      traceAction: opts.traceAction,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    crmSync = { status: "failed", error };
    await db.businessRecord.update({
      where: { id: record.id },
      data: { crmSyncStatus: "FAILED", crmSyncError: error },
    });
  }

  return { record, crmSync };
}

export function parseCrmRecorderUserIdsFromForm(formData: FormData, fallbackUserId: string): string[] {
  const fromList = formData.getAll("crmRecorderUserIds").map((v) => String(v).trim()).filter(Boolean);
  if (fromList.length) return [...new Set(fromList)];
  const raw = String(formData.get("crmRecorderUserIds") ?? "").trim();
  if (raw) return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  return [fallbackUserId];
}

export async function assertCrmRecordersMapped(
  userIds: string[],
): Promise<{ ok: true } | { ok: false; error: "crm_recorders_required" | "crm_recorders_unmapped" }> {
  if (!userIds.length) return { ok: false, error: "crm_recorders_required" };
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, crmSalesmanName: true },
  });
  if (users.length !== userIds.length || users.some((u) => !u.crmSalesmanName?.trim())) {
    return { ok: false, error: "crm_recorders_unmapped" };
  }
  return { ok: true };
}

export function formatBusinessRecordCrmFeedback(crmSync: CrmBusinessRecordSyncResult): {
  message?: string;
  warning?: string;
  info?: string;
} {
  if (crmSync.status === "synced") {
    if (crmSync.traceCount && crmSync.traceCount > 1) {
      return { message: `Synced to CRM (${crmSync.traceCount} records)` };
    }
    return { message: `Synced to CRM (${crmSync.traceId.slice(0, 8)}…)` };
  }
  if (crmSync.status === "partial") {
    return {
      warning: `Saved locally; CRM partially synced (${crmSync.syncedCount}/${crmSync.totalCount}): ${crmSync.error}`,
    };
  }
  if (crmSync.status === "failed") {
    return { warning: `Saved locally; CRM sync failed: ${crmSync.error}` };
  }
  return { info: `Saved locally (CRM: ${crmSync.reason})` };
}
