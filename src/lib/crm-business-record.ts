import { randomUUID } from "crypto";
import { db } from "./db";
import { submitCrmBusinessRecord, type CrmTraceInsertPayload } from "./crm";
import type { BusinessRecordCategory } from "./business-record-core";

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

function mapCategoryToNature(category: BusinessRecordCategory): CrmTraceInsertPayload["traceNature"] {
  return category === "VISIT" ? "现场" : "非现场";
}

function mapCategoryToAction(category: BusinessRecordCategory) {
  const map: Record<BusinessRecordCategory, string> = {
    VISIT: "拜访",
    TRAINING: "培训",
    NEGOTIATION: "商务谈判",
    DELIVERY: "交付",
    RELATIONSHIP: "关系维护",
    OTHER: "其他",
  };
  return map[category] ?? "其他";
}

function buildTraceDetail(title: string, content: string | null | undefined) {
  const body = content?.trim();
  return body ? `${title.trim()}\n${body}` : title.trim();
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
  partnerId: string;
  userId: string;
  category: BusinessRecordCategory;
  title: string;
  content?: string | null;
  occurredAt: Date;
  contactId?: string | null;
}): Promise<CrmBusinessRecordSyncResult> {
  if (process.env.CRM_TRACE_ENABLED === "0") {
    const result = { status: "skipped" as const, reason: "CRM 商务记录同步已关闭" };
    await persistCrmSyncState(opts.recordId, result);
    return result;
  }

  const [partner, user] = await Promise.all([
    db.partner.findUnique({
      where: { id: opts.partnerId },
      select: { crmCustomerId: true },
    }),
    db.user.findUnique({
      where: { id: opts.userId },
      select: { crmSalesmanName: true },
    }),
  ]);

  if (!partner?.crmCustomerId) {
    const result = { status: "skipped" as const, reason: "伙伴未匹配 CRM 客户" };
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
  const traceContact = await resolveCrmContactId(partner.crmCustomerId, opts.contactId);

  try {
    await submitCrmBusinessRecord({
      traceId,
      traceNature: mapCategoryToNature(opts.category),
      traceCompany: partner.crmCustomerId,
      traceContact,
      traceRecdate: formatCrmDate(opts.occurredAt),
      traceRectime: formatCrmTime(now),
      traceRecorder: user.crmSalesmanName,
      traceAction: mapCategoryToAction(opts.category),
      traceDetail: buildTraceDetail(opts.title, opts.content),
    });

    await persistCrmSyncState(opts.recordId, { status: "synced", traceId });
    return { status: "synced", traceId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await persistCrmSyncState(opts.recordId, { status: "failed", error, traceId }, traceId);
    return { status: "failed", error, traceId };
  }
}
