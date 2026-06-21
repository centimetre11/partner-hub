import { randomUUID } from "crypto";
import { db } from "./db";
import { submitCrmBusinessRecord } from "./crm";
import { resolveCrmTraceFields } from "./crm-trace-payload";
import type { CrmTraceAction, CrmTraceNature } from "./crm-trace-constants";
import type { BusinessRecordCategory } from "./business-record-core";
import type { OwnerRef } from "./owner";

export type CrmBusinessRecordSyncResult =
  | { status: "synced"; traceId: string }
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

async function persistCrmSyncState(recordId: string, result: CrmBusinessRecordSyncResult, traceId?: string) {
  const now = new Date();
  if (result.status === "synced") {
    await db.businessRecord.update({
      where: { id: recordId },
      data: {
        crmSyncStatus: "SYNCED",
        crmTraceId: result.traceId,
        crmSyncedAt: now,
        crmSyncError: null,
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
      },
    });
    return;
  }
  await db.businessRecord.update({
    where: { id: recordId },
    data: {
      crmSyncStatus: "SKIPPED",
      crmSyncError: result.reason,
    },
  });
}

export async function syncBusinessRecordToCrm(opts: {
  recordId: string;
  owner: OwnerRef;
  userId: string;
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

  const [crmCustomerId, user] = await Promise.all([
    opts.owner.kind === "customer"
      ? db.customer.findUnique({ where: { id: opts.owner.id }, select: { crmCustomerId: true } }).then((c) => c?.crmCustomerId ?? null)
      : db.partner.findUnique({ where: { id: opts.owner.id }, select: { crmCustomerId: true } }).then((p) => p?.crmCustomerId ?? null),
    db.user.findUnique({
      where: { id: opts.userId },
      select: { crmSalesmanName: true },
    }),
  ]);

  if (!crmCustomerId) {
    const result = {
      status: "skipped" as const,
      reason: opts.owner.kind === "customer" ? "客户未匹配 CRM 客户" : "伙伴未匹配 CRM 客户",
    };
    await persistCrmSyncState(opts.recordId, result);
    return result;
  }
  if (!user?.crmSalesmanName) {
    const result = { status: "skipped" as const, reason: "当前用户未匹配 CRM 销售账号" };
    await persistCrmSyncState(opts.recordId, result);
    return result;
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

    await persistCrmSyncState(opts.recordId, { status: "synced", traceId });
    return { status: "synced", traceId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await persistCrmSyncState(opts.recordId, { status: "failed", error, traceId }, traceId);
    return { status: "failed", error, traceId };
  }
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
