import { randomUUID } from "crypto";
import { db } from "./db";
import { submitCrmBusinessRecord } from "./crm";
import { resolveCrmTraceFields } from "./crm-trace-payload";
import type { CrmTraceAction, CrmTraceNature } from "./crm-trace-constants";
import type { BusinessRecordCategory } from "./business-record-core";
import type { OwnerRef } from "./owner";

export type CrmBusinessRecordSyncResult =
  | { status: "synced"; traceId: string; traceCount?: number }
  | { status: "partial"; syncedCount: number; totalCount: number; traceIds: string[]; error: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; traceId?: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatCrmDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatCrmTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

async function resolveCrmContactId(crmCustomerId: string, contactId: string | null | undefined) {
  if (!contactId) return null;
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { name: true },
  });
  if (!contact?.name) return null;

  const exact = await db.crmContact.findFirst({
    where: { customerId: crmCustomerId, name: contact.name },
    select: { id: true },
  });
  if (exact) return exact.id;

  const fuzzy = await db.crmContact.findFirst({
    where: {
      customerId: crmCustomerId,
      OR: [{ name: { contains: contact.name } }, { name: { contains: contact.name.split(/\s+/)[0] ?? contact.name } }],
    },
    select: { id: true },
  });
  return fuzzy?.id ?? null;
}

async function persistCrmSyncState(
  recordId: string,
  result: CrmBusinessRecordSyncResult,
  traceId?: string,
  recorderUserIds?: string[],
) {
  const now = new Date();
  const recorderJson = recorderUserIds?.length ? JSON.stringify(recorderUserIds) : undefined;

  if (result.status === "synced") {
    await db.businessRecord.update({
      where: { id: recordId },
      data: {
        crmSyncStatus: "SYNCED",
        crmTraceId: result.traceId,
        crmSyncedAt: now,
        crmSyncError: null,
        ...(recorderJson ? { crmRecorderUserIds: recorderJson } : {}),
      },
    });
    return;
  }
  if (result.status === "partial") {
    await db.businessRecord.update({
      where: { id: recordId },
      data: {
        crmSyncStatus: "PARTIAL",
        crmTraceId: result.traceIds[0] ?? null,
        crmSyncedAt: now,
        crmSyncError: result.error,
        ...(recorderJson ? { crmRecorderUserIds: recorderJson } : {}),
      },
    });
    return;
  }
  if (result.status === "failed") {
    await db.businessRecord.update({
      where: { id: recordId },
      data: {
        crmSyncStatus: "FAILED",
        crmTraceId: traceId ?? result.traceId ?? null,
        crmSyncError: result.error,
        ...(recorderJson ? { crmRecorderUserIds: recorderJson } : {}),
      },
    });
    return;
  }
  await db.businessRecord.update({
    where: { id: recordId },
    data: {
      crmSyncStatus: "SKIPPED",
      crmSyncError: result.reason,
      ...(recorderJson ? { crmRecorderUserIds: recorderJson } : {}),
    },
  });
}

export function parseCrmRecorderUserIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((id) => String(id).trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

async function submitOneCrmTrace(opts: {
  owner: OwnerRef;
  recorderUserId: string;
  category: BusinessRecordCategory;
  title: string;
  content?: string | null;
  occurredAt: Date;
  contactId?: string | null;
  traceNature?: string | null;
  traceAction?: string | null;
}): Promise<
  | { ok: true; traceId: string; recorderName: string }
  | { ok: false; reason: string; traceId?: string }
> {
  const [crmCustomerId, user] = await Promise.all([
    opts.owner.kind === "customer"
      ? db.customer.findUnique({ where: { id: opts.owner.id }, select: { crmCustomerId: true } }).then((c) => c?.crmCustomerId ?? null)
      : db.partner.findUnique({ where: { id: opts.owner.id }, select: { crmCustomerId: true } }).then((p) => p?.crmCustomerId ?? null),
    db.user.findUnique({
      where: { id: opts.recorderUserId },
      select: { crmSalesmanName: true, name: true },
    }),
  ]);

  if (!crmCustomerId) {
    return {
      ok: false,
      reason: opts.owner.kind === "customer" ? "客户未匹配 CRM 客户" : "伙伴未匹配 CRM 客户",
    };
  }
  if (!user?.crmSalesmanName) {
    return {
      ok: false,
      reason: `${user?.name ?? "用户"} 未匹配 CRM 销售账号`,
    };
  }

  const traceId = randomUUID();
  const now = new Date();
  const traceContact = await resolveCrmContactId(crmCustomerId, opts.contactId);
  const crmFields = resolveCrmTraceFields({
    title: opts.title,
    content: opts.content,
    category: opts.category,
    traceNature: opts.traceNature,
    traceAction: opts.traceAction,
  });

  try {
    await submitCrmBusinessRecord({
      traceId,
      traceNature: crmFields.traceNature as CrmTraceNature,
      traceCompany: crmCustomerId,
      traceContact,
      traceRecdate: formatCrmDate(opts.occurredAt),
      traceRectime: formatCrmTime(now),
      traceRecorder: user.crmSalesmanName,
      traceAction: crmFields.traceAction as CrmTraceAction,
      traceDetail: crmFields.traceDetail,
      traceKeyword: crmFields.traceKeyword,
    });
    return { ok: true, traceId, recorderName: user.crmSalesmanName };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: error, traceId };
  }
}

export async function syncBusinessRecordToCrm(opts: {
  recordId: string;
  owner: OwnerRef;
  userId: string;
  recorderUserIds?: string[];
  category: BusinessRecordCategory;
  title: string;
  content?: string | null;
  occurredAt: Date;
  contactId?: string | null;
  traceNature?: string | null;
  traceAction?: string | null;
}): Promise<CrmBusinessRecordSyncResult> {
  if (process.env.CRM_TRACE_ENABLED === "0") {
    const result = { status: "skipped" as const, reason: "CRM 商务记录同步已关闭" };
    await persistCrmSyncState(opts.recordId, result);
    return result;
  }

  const recorderUserIds = [...new Set((opts.recorderUserIds?.length ? opts.recorderUserIds : [opts.userId]).filter(Boolean))];
  if (!recorderUserIds.length) {
    const result = { status: "skipped" as const, reason: "未选择 CRM 录入人" };
    await persistCrmSyncState(opts.recordId, result);
    return result;
  }

  const traceIds: string[] = [];
  const failures: string[] = [];

  for (const recorderUserId of recorderUserIds) {
    const one = await submitOneCrmTrace({
      owner: opts.owner,
      recorderUserId,
      category: opts.category,
      title: opts.title,
      content: opts.content,
      occurredAt: opts.occurredAt,
      contactId: opts.contactId,
      traceNature: opts.traceNature,
      traceAction: opts.traceAction,
    });
    if (one.ok) {
      traceIds.push(one.traceId);
    } else {
      failures.push(one.reason);
    }
  }

  if (traceIds.length === recorderUserIds.length) {
    const result = {
      status: "synced" as const,
      traceId: traceIds[0]!,
      traceCount: traceIds.length,
    };
    await persistCrmSyncState(opts.recordId, result, traceIds[0], recorderUserIds);
    return result;
  }

  if (traceIds.length > 0) {
    const result = {
      status: "partial" as const,
      syncedCount: traceIds.length,
      totalCount: recorderUserIds.length,
      traceIds,
      error: failures.join("；"),
    };
    await persistCrmSyncState(opts.recordId, result, traceIds[0], recorderUserIds);
    return result;
  }

  const result = { status: "failed" as const, error: failures.join("；") };
  await persistCrmSyncState(opts.recordId, result, undefined, recorderUserIds);
  return result;
}

/** Write a business trace to FanRuan CRM without a Partner Hub partner / BusinessRecord row. */
export async function submitBusinessRecordToCrmOnly(opts: {
  crmCustomerId: string;
  userId: string;
  category: BusinessRecordCategory;
  title: string;
  content?: string | null;
  occurredAt: Date;
  traceNature?: string | null;
  traceAction?: string | null;
}): Promise<CrmBusinessRecordSyncResult> {
  if (process.env.CRM_TRACE_ENABLED === "0") {
    return { status: "skipped", reason: "CRM 商务记录同步已关闭" };
  }

  const user = await db.user.findUnique({
    where: { id: opts.userId },
    select: { crmSalesmanName: true },
  });
  if (!user?.crmSalesmanName) {
    return { status: "skipped", reason: "当前用户未匹配 CRM 销售账号" };
  }

  const crmCustomer = await db.crmCustomer.findUnique({
    where: { id: opts.crmCustomerId },
    select: { id: true, name: true },
  });
  if (!crmCustomer) {
    return { status: "failed", error: "CRM 客户不存在或尚未同步到本地" };
  }

  const traceId = randomUUID();
  const now = new Date();
  const crmFields = resolveCrmTraceFields({
    title: opts.title,
    content: opts.content,
    category: opts.category,
    traceNature: opts.traceNature,
    traceAction: opts.traceAction,
  });

  try {
    await submitCrmBusinessRecord({
      traceId,
      traceNature: crmFields.traceNature as CrmTraceNature,
      traceCompany: crmCustomer.id,
      traceContact: null,
      traceRecdate: formatCrmDate(opts.occurredAt),
      traceRectime: formatCrmTime(now),
      traceRecorder: user.crmSalesmanName,
      traceAction: crmFields.traceAction as CrmTraceAction,
      traceDetail: crmFields.traceDetail,
      traceKeyword: crmFields.traceKeyword,
    });
    return { status: "synced", traceId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { status: "failed", error, traceId };
  }
}
