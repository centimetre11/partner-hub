"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";
import { recordSystemEvent } from "./activity-log";
import { chatJson } from "./ai";
import { getLocale } from "./i18n/locale-server";

const CUSTOMER_STATUSES = ["ACTIVE", "PROSPECT", "INACTIVE"] as const;

function normalizeStatus(value: string | null | undefined): string {
  const v = String(value ?? "").trim().toUpperCase();
  return (CUSTOMER_STATUSES as readonly string[]).includes(v) ? v : "ACTIVE";
}

function str(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

function readCustomerFields(formData: FormData) {
  return {
    industry: str(formData, "industry"),
    city: str(formData, "city"),
    country: str(formData, "country"),
    website: str(formData, "website"),
    scale: str(formData, "scale"),
    contactName: str(formData, "contactName"),
    contactTitle: str(formData, "contactTitle"),
    contactPhone: str(formData, "contactPhone"),
    contactEmail: str(formData, "contactEmail"),
    notes: str(formData, "notes"),
    ownerId: str(formData, "ownerId"),
  };
}

function revalidateCustomerPaths(customerId?: string, partnerIds: (string | null | undefined)[] = []) {
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  for (const pid of partnerIds) {
    if (pid) revalidatePath(`/partners/${pid}`);
  }
}

// ============ 创建 ============

export async function createCustomerAction(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const partnerId = str(formData, "partnerId");
  const redirectTo = String(formData.get("redirectTo") ?? "");

  const customer = await db.customer.create({
    data: {
      name,
      status: normalizeStatus(formData.get("status") as string | null),
      partnerId,
      createdById: user.id,
      ...readCustomerFields(formData),
    },
  });

  void recordSystemEvent({
    category: "CUSTOMER",
    action: "customer.create",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Customer",
    targetId: customer.id,
    targetLabel: customer.name,
    summary: `新建客户：${customer.name}`,
    meta: { partnerId },
  });

  revalidateCustomerPaths(customer.id, [partnerId]);

  if (redirectTo === "detail") redirect(`/customers/${customer.id}`);
}

// ============ 更新 ============

export async function updateCustomerAction(customerId: string, formData: FormData) {
  await requireUser();
  const existing = await db.customer.findUnique({ where: { id: customerId }, select: { partnerId: true } });
  if (!existing) return;
  const name = String(formData.get("name") ?? "").trim();
  const data: Record<string, unknown> = {
    status: normalizeStatus(formData.get("status") as string | null),
    ...readCustomerFields(formData),
  };
  if (name) data.name = name;

  await db.customer.update({ where: { id: customerId }, data });
  revalidateCustomerPaths(customerId, [existing.partnerId]);
}

// ============ 删除 ============

export async function deleteCustomerAction(customerId: string) {
  const user = await requireUser();
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return;
  await db.customer.delete({ where: { id: customerId } });
  void recordSystemEvent({
    category: "CUSTOMER",
    action: "customer.delete",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Customer",
    targetId: customerId,
    targetLabel: customer.name,
    summary: `删除客户：${customer.name}`,
  });
  revalidateCustomerPaths(undefined, [customer.partnerId]);
  redirect("/customers");
}

// ============ 绑定 / 解绑（客户详情页：选择伙伴） ============

export async function setCustomerPartnerAction(customerId: string, formData: FormData) {
  await requireUser();
  const partnerId = str(formData, "partnerId");
  const existing = await db.customer.findUnique({ where: { id: customerId }, select: { partnerId: true } });
  if (!existing) return;
  await db.customer.update({ where: { id: customerId }, data: { partnerId } });
  revalidateCustomerPaths(customerId, [existing.partnerId, partnerId]);
}

// ============ 伙伴详情页：绑定已有客户 / 新建并绑定 / 解绑 ============

export async function bindCustomerToPartnerAction(partnerId: string, formData: FormData) {
  await requireUser();
  const customerId = str(formData, "customerId");
  if (!customerId) return;
  await db.customer.update({ where: { id: customerId }, data: { partnerId } });
  revalidateCustomerPaths(customerId, [partnerId]);
}

export async function unbindCustomerFromPartnerAction(partnerId: string, customerId: string) {
  await requireUser();
  await db.customer.update({ where: { id: customerId }, data: { partnerId: null } });
  revalidateCustomerPaths(customerId, [partnerId]);
}

export async function createCustomerForPartnerAction(partnerId: string, formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const customer = await db.customer.create({
    data: {
      name,
      status: "ACTIVE",
      partnerId,
      partnerRelation: "SERVED_BY",
      createdById: user.id,
      industry: str(formData, "industry"),
      city: str(formData, "city"),
    },
  });
  void recordSystemEvent({
    category: "CUSTOMER",
    action: "customer.create",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Customer",
    targetId: customer.id,
    targetLabel: customer.name,
    summary: `新建客户并绑定伙伴：${customer.name}`,
    meta: { partnerId },
  });
  revalidateCustomerPaths(customer.id, [partnerId]);
}

// 伙伴本身也是客户：为伙伴生成「自营客户」档案（SELF）
export async function createSelfCustomerForPartnerAction(partnerId: string) {
  const user = await requireUser();
  const partner = await db.partner.findUnique({ where: { id: partnerId }, select: { name: true, city: true, country: true, website: true, crmCustomerId: true, kmsRootPath: true } });
  if (!partner) return;
  const existing = await db.customer.findFirst({ where: { partnerId, partnerRelation: "SELF" } });
  if (existing) {
    revalidateCustomerPaths(existing.id, [partnerId]);
    return;
  }
  const customer = await db.customer.create({
    data: {
      name: partner.name,
      status: "ACTIVE",
      partnerId,
      partnerRelation: "SELF",
      city: partner.city,
      country: partner.country,
      website: partner.website,
      crmCustomerId: partner.crmCustomerId,
      kmsRootPath: partner.kmsRootPath,
      createdById: user.id,
    },
  });
  void recordSystemEvent({
    category: "CUSTOMER",
    action: "customer.create_self",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Customer",
    targetId: customer.id,
    targetLabel: customer.name,
    summary: `为伙伴生成自营客户档案：${customer.name}`,
    meta: { partnerId },
  });
  revalidateCustomerPaths(customer.id, [partnerId]);
}

// ============ 帆软三连接（KMS / CRM 客户） ============

export async function updateCustomerIntegrationsAction(customerId: string, formData: FormData) {
  await requireUser();
  const kmsRootPath = String(formData.get("kmsRootPath") ?? "").trim() || null;
  const crmCustomerId = String(formData.get("crmCustomerId") ?? "").trim() || null;
  await db.customer.update({ where: { id: customerId }, data: { kmsRootPath, crmCustomerId } });
  revalidatePath(`/customers/${customerId}`);
}

// ============ AI 建档 ============

export type CustomerAiContact = {
  name: string;
  title?: string;
  department?: string;
  role?: string;
  notes?: string;
};

export type CustomerAiDraft = {
  name?: string;
  status?: string;
  industry?: string;
  city?: string;
  country?: string;
  website?: string;
  scale?: string;
  contactName?: string;
  contactTitle?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  contacts?: CustomerAiContact[];
};

const VALID_CONTACT_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];

export async function draftCustomerFromTextAction(text: string): Promise<{ draft?: CustomerAiDraft; error?: string }> {
  const user = await requireUser();
  const trimmed = text.trim();
  if (!trimmed) return { error: "empty" };
  const locale = await getLocale();
  const langLine = locale === "zh" ? "请用中文填充文本字段。" : "Fill text fields in English.";
  const system = [
    "You extract a structured end-customer (account) profile from raw notes (meeting notes / company intro / chat logs).",
    "Output STRICT JSON only, matching this TypeScript type:",
    "{ name?: string; status?: 'ACTIVE'|'PROSPECT'|'INACTIVE'; industry?: string; city?: string; country?: string; website?: string; scale?: string; contactName?: string; contactTitle?: string; contactPhone?: string; contactEmail?: string; notes?: string; contacts?: { name: string; title?: string; department?: string; role?: 'APPROVER'|'DECISION_MAKER'|'SUPPORTER'|'EVALUATOR'|'INFLUENCER'; notes?: string }[] }",
    "Only include fields you can infer from the text; omit unknown fields. Do not invent data.",
    langLine,
  ].join("\n");
  try {
    const draft = await chatJson<CustomerAiDraft>(system, trimmed, { feature: "customer_intake", userId: user.id, taskTier: "fast" });
    return { draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function applyCustomerAiDraftAction(
  customerId: string | null,
  draft: CustomerAiDraft,
  partnerId?: string | null,
): Promise<{ id: string }> {
  const user = await requireUser();
  const profile = {
    industry: draft.industry?.trim() || undefined,
    city: draft.city?.trim() || undefined,
    country: draft.country?.trim() || undefined,
    website: draft.website?.trim() || undefined,
    scale: draft.scale?.trim() || undefined,
    contactName: draft.contactName?.trim() || undefined,
    contactTitle: draft.contactTitle?.trim() || undefined,
    contactPhone: draft.contactPhone?.trim() || undefined,
    contactEmail: draft.contactEmail?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
    status: draft.status ? normalizeStatus(draft.status) : undefined,
  };

  let id = customerId ?? "";
  if (id) {
    await db.customer.update({ where: { id }, data: profile });
  } else {
    const created = await db.customer.create({
      data: {
        name: draft.name?.trim() || "未命名客户",
        partnerId: partnerId ?? null,
        createdById: user.id,
        ...profile,
      },
    });
    id = created.id;
  }

  const contacts = (draft.contacts ?? []).filter((c) => c?.name?.trim());
  for (const c of contacts) {
    await db.contact.create({
      data: {
        customerId: id,
        name: c.name.trim(),
        title: c.title?.trim() || null,
        department: c.department?.trim() || null,
        role: c.role && VALID_CONTACT_ROLES.includes(c.role) ? c.role : "INFLUENCER",
        notes: c.notes?.trim() || null,
      },
    });
  }

  void recordSystemEvent({
    category: "CUSTOMER",
    action: customerId ? "customer.ai_update" : "customer.ai_create",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Customer",
    targetId: id,
    summary: customerId ? "AI 补全客户档案" : "AI 建档新客户",
    meta: { contacts: contacts.length },
  });

  revalidateCustomerPaths(id, [partnerId]);
  return { id };
}
