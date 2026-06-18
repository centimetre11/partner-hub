"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSuperAdmin, requireUser } from "./session";
import { syncCrmData } from "./crm-sync";

export async function triggerCrmSyncAction() {
  await requireSuperAdmin();
  const result = await syncCrmData();
  revalidatePath("/settings");
  revalidatePath("/account");
  if (!result.ok) return { error: result.error ?? "CRM sync failed" };
  return {
    ok: true,
    message: `Synced ${result.customerCount} customers, ${result.contactCount} contacts (${result.durationMs}ms)`,
  };
}

export async function saveCrmSalesmanMappingAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("crmSalesmanName") ?? "").trim();
  const crmSalesmanName = raw || null;

  await db.user.update({
    where: { id: user.id },
    data: { crmSalesmanName },
  });

  revalidatePath("/account");
  return { ok: true, message: crmSalesmanName ? `CRM 用户已匹配：${crmSalesmanName}` : "已清除 CRM 用户匹配" };
}

export async function searchCrmCustomersAction(query: string, limit = 20) {
  await requireUser();
  const q = query.trim();
  if (!q) return [];

  return db.crmCustomer.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { id: { contains: q } },
        { city: { contains: q } },
        { salesman: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
    take: Math.min(limit, 50),
    select: {
      id: true,
      name: true,
      city: true,
      status: true,
      salesman: true,
    },
  });
}

export async function suggestCrmCustomerForPartnerAction(partnerId: string) {
  await requireUser();
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { name: true, crmCustomerId: true },
  });
  if (!partner) return null;

  const exact = await db.crmCustomer.findFirst({
    where: { name: partner.name },
    select: { id: true, name: true, city: true, status: true, salesman: true },
  });
  if (exact) return exact;

  const fuzzy = await db.crmCustomer.findFirst({
    where: { name: { contains: partner.name.slice(0, Math.min(partner.name.length, 8)) } },
    select: { id: true, name: true, city: true, status: true, salesman: true },
  });
  return fuzzy;
}

export async function retryCrmBusinessRecordSyncAction(recordId: string) {
  const user = await requireUser();
  const record = await db.businessRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      partnerId: true,
      category: true,
      title: true,
      content: true,
      occurredAt: true,
      contactId: true,
      crmSyncedAt: true,
    },
  });
  if (!record) return { error: "商务记录不存在" };
  if (record.crmSyncedAt) return { error: "该记录已同步到 CRM" };

  const { syncBusinessRecordToCrm } = await import("./crm-business-record");
  const { normalizeBusinessRecordCategory } = await import("./business-record-core");
  const crmSync = await syncBusinessRecordToCrm({
    recordId: record.id,
    partnerId: record.partnerId,
    userId: user.id,
    category: normalizeBusinessRecordCategory(record.category),
    title: record.title,
    content: record.content,
    occurredAt: record.occurredAt,
    contactId: record.contactId,
  });

  revalidatePath(`/partners/${record.partnerId}`);
  if (crmSync.status === "synced") {
    return { ok: true, message: `已同步到 CRM（${crmSync.traceId.slice(0, 8)}…）` };
  }
  if (crmSync.status === "failed") {
    return { error: crmSync.error };
  }
  return { error: crmSync.reason };
}

export async function getCrmSalesmenAction() {
  await requireUser();
  const rows = await db.crmCustomer.findMany({
    where: { salesman: { not: null } },
    distinct: ["salesman"],
    select: { salesman: true },
    orderBy: { salesman: "asc" },
  });
  return rows.map((r) => r.salesman!).filter(Boolean);
}
