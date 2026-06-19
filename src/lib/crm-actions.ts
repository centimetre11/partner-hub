"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSuperAdmin, requireUser } from "./session";
import { syncCrmData } from "./crm-sync";
import { getCrmRecorderNames, getCrmExtraRecordersFromSettings, saveCrmExtraRecorders } from "./crm-recorders";

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

export type CrmCustomerSuggestion = {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
  salesman: string | null;
  matchReason: "exact" | "contains" | "token" | "prefix";
  score: number;
};

function scorePartnerCrmName(partnerName: string, customerName: string) {
  const p = partnerName.toLowerCase().trim();
  const c = customerName.toLowerCase().trim();
  if (!p || !c) return { score: 0, matchReason: "prefix" as const };

  if (p === c) return { score: 100, matchReason: "exact" as const };
  if (c.includes(p) || p.includes(c)) return { score: 85, matchReason: "contains" as const };

  const words = p.split(/\s+/).filter((w) => w.length >= 2);
  let tokenHits = 0;
  for (const w of words) {
    if (c.includes(w)) tokenHits++;
  }
  if (tokenHits > 0) {
    return { score: 55 + tokenHits * 12, matchReason: "token" as const };
  }

  const prefix = p.slice(0, Math.min(4, p.length));
  if (prefix.length >= 3 && c.includes(prefix)) {
    return { score: 40, matchReason: "prefix" as const };
  }

  return { score: 0, matchReason: "prefix" as const };
}

export async function suggestCrmCustomersForPartnerAction(partnerId: string, limit = 8) {
  await requireUser();
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { name: true },
  });
  if (!partner?.name.trim()) {
    return { partnerName: "", candidates: [] as CrmCustomerSuggestion[] };
  }

  const partnerName = partner.name.trim();
  const words = partnerName.split(/\s+/).filter((w) => w.length >= 2);
  const prefix = partnerName.slice(0, Math.min(8, partnerName.length));

  const rows = await db.crmCustomer.findMany({
    where: {
      OR: [
        { name: { contains: partnerName } },
        ...(prefix.length >= 3 ? [{ name: { contains: prefix } }] : []),
        ...words.map((w) => ({ name: { contains: w } })),
      ],
    },
    take: 60,
    select: {
      id: true,
      name: true,
      city: true,
      status: true,
      salesman: true,
    },
  });

  const ranked = rows
    .map((row) => {
      const { score, matchReason } = scorePartnerCrmName(partnerName, row.name);
      return { ...row, score, matchReason };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  return { partnerName, candidates: ranked };
}

/** @deprecated use suggestCrmCustomersForPartnerAction */
export async function suggestCrmCustomerForPartnerAction(partnerId: string) {
  const { candidates } = await suggestCrmCustomersForPartnerAction(partnerId, 1);
  return candidates[0] ?? null;
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
      crmTraceNature: true,
      crmTraceAction: true,
      crmSyncedAt: true,
      crmSyncStatus: true,
    },
  });
  if (!record) return { error: "商务记录不存在" };
  if (record.crmSyncStatus === "SYNCED" || record.crmSyncedAt) return { error: "该记录已同步到 CRM" };

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
    traceNature: record.crmTraceNature,
    traceAction: record.crmTraceAction,
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
  return getCrmRecorderNames();
}

export async function getCrmExtraRecordersAction() {
  await requireSuperAdmin();
  return getCrmExtraRecordersFromSettings();
}

export async function saveCrmExtraRecordersAction(formData: FormData) {
  await requireSuperAdmin();
  const raw = String(formData.get("extraRecorders") ?? "");
  const names = await saveCrmExtraRecorders(raw);
  revalidatePath("/settings");
  revalidatePath("/account");
  return {
    ok: true,
    message: names.length ? `已保存 ${names.length} 个 CRM 录入人补录` : "已清空 CRM 录入人补录",
  };
}
