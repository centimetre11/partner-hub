import { db } from "./db";
import { syncBusinessRecordToCrm, type CrmBusinessRecordSyncResult } from "./crm-business-record";

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

export type BusinessRecordCrmSyncStatus = "SYNCED" | "FAILED" | "SKIPPED";

export type BusinessRecordCrmSyncDisplay = {
  status: BusinessRecordCrmSyncStatus | "PENDING";
  reason?: string;
  syncedAt?: Date;
};

export function resolveBusinessRecordCrmSync(record: {
  crmSyncStatus?: string | null;
  crmSyncedAt?: Date | string | null;
  crmSyncError?: string | null;
}): BusinessRecordCrmSyncDisplay {
  const syncedAt = record.crmSyncedAt ? new Date(record.crmSyncedAt) : undefined;
  if (record.crmSyncStatus === "SYNCED" || syncedAt) {
    return { status: "SYNCED", syncedAt };
  }
  if (record.crmSyncStatus === "FAILED") {
    return { status: "FAILED", reason: record.crmSyncError ?? undefined };
  }
  if (record.crmSyncStatus === "SKIPPED") {
    return { status: "SKIPPED", reason: record.crmSyncError ?? undefined };
  }
  if (record.crmSyncError) {
    return { status: "FAILED", reason: record.crmSyncError };
  }
  return { status: "PENDING" };
}

export async function persistBusinessRecord(opts: {
  partnerId: string;
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
}) {
  const category = normalizeBusinessRecordCategory(opts.category);
  const event = await db.timelineEvent.create({
    data: {
      partnerId: opts.partnerId,
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
      partnerId: opts.partnerId,
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
      partnerId: opts.partnerId,
      userId: opts.userId,
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
