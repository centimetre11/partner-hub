"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";
import { recordSystemEvent } from "./activity-log";

const CUSTOMER_STATUSES = ["ACTIVE", "PROSPECT", "INACTIVE"] as const;

function normalizeStatus(value: string | null | undefined): string {
  const v = String(value ?? "").trim().toUpperCase();
  return (CUSTOMER_STATUSES as readonly string[]).includes(v) ? v : "PROSPECT";
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
    presalesUserId: str(formData, "presalesUserId"),
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
      createdById: user.id,
      ...readCustomerFields(formData),
    },
  });

  if (partnerId) {
    await db.customerPartner.create({
      data: { customerId: customer.id, partnerId, relation: "SERVED_BY" },
    });
  }

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
  const existing = await db.customer.findUnique({
    where: { id: customerId },
    select: { partnerLinks: { select: { partnerId: true } } },
  });
  if (!existing) return { error: "Customer not found" };

  const data: Record<string, unknown> = {};
  if (formData.has("name")) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "NAME_REQUIRED" };
    data.name = name;
  }
  if (formData.has("status")) {
    data.status = normalizeStatus(formData.get("status") as string | null);
  }
  for (const key of [
    "industry", "city", "country", "website", "scale",
    "contactName", "contactTitle", "contactPhone", "contactEmail",
    "notes", "ownerId", "presalesUserId",
  ] as const) {
    if (formData.has(key)) data[key] = str(formData, key);
  }
  if (!Object.keys(data).length) return { ok: true as const };

  await db.customer.update({ where: { id: customerId }, data });
  revalidateCustomerPaths(customerId, existing.partnerLinks.map((l) => l.partnerId));
  return { ok: true as const };
}

// ============ 跟单五问（STOCK） ============

export async function updateCustomerStockAction(customerId: string, formData: FormData) {
  await requireUser();
  const existing = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!existing) return;
  await db.customer.update({
    where: { id: customerId },
    data: {
      q5Situation: str(formData, "q5Situation"),
      q5Trouble: str(formData, "q5Trouble"),
      q5Order: str(formData, "q5Order"),
      q5Cost: str(formData, "q5Cost"),
      q5Key: str(formData, "q5Key"),
    },
  });
  revalidateCustomerPaths(customerId);
}

// ============ 删除 ============

export async function deleteCustomerAction(customerId: string) {
  const user = await requireUser();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { partnerLinks: { select: { partnerId: true } } },
  });
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
  revalidateCustomerPaths(undefined, customer.partnerLinks.map((l) => l.partnerId));
  redirect("/customers");
}

// ============ 绑定 / 解绑（客户详情页：可绑定多个伙伴） ============

// 为客户新增一个伙伴绑定（多对多，可重复调用绑定多个伙伴）
export async function addCustomerPartnerAction(customerId: string, formData: FormData) {
  await requireUser();
  const partnerId = str(formData, "partnerId");
  if (!partnerId) return;
  const existing = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!existing) return;
  await db.customerPartner.upsert({
    where: { customerId_partnerId: { customerId, partnerId } },
    create: { customerId, partnerId, relation: "SERVED_BY" },
    update: {},
  });
  revalidateCustomerPaths(customerId, [partnerId]);
}

// 移除客户的某个伙伴绑定
export async function removeCustomerPartnerAction(customerId: string, partnerId: string) {
  await requireUser();
  await db.customerPartner.deleteMany({ where: { customerId, partnerId } });
  revalidateCustomerPaths(customerId, [partnerId]);
}

// ============ 伙伴详情页：绑定已有客户 / 新建并绑定 / 解绑 ============

export async function bindCustomerToPartnerAction(partnerId: string, formData: FormData) {
  await requireUser();
  const customerId = str(formData, "customerId");
  if (!customerId) return;
  await db.customerPartner.upsert({
    where: { customerId_partnerId: { customerId, partnerId } },
    create: { customerId, partnerId, relation: "SERVED_BY" },
    update: {},
  });
  revalidateCustomerPaths(customerId, [partnerId]);
}

export async function unbindCustomerFromPartnerAction(partnerId: string, customerId: string) {
  await requireUser();
  await db.customerPartner.deleteMany({ where: { customerId, partnerId } });
  revalidateCustomerPaths(customerId, [partnerId]);
}

export async function createCustomerForPartnerAction(partnerId: string, formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const customer = await db.customer.create({
    data: {
      name,
      status: "PROSPECT",
      partnerRelation: "SERVED_BY",
      createdById: user.id,
      industry: str(formData, "industry"),
      city: str(formData, "city"),
      partnerLinks: { create: { partnerId, relation: "SERVED_BY" } },
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
  const existing = await db.customer.findFirst({
    where: { partnerRelation: "SELF", partnerLinks: { some: { partnerId } } },
  });
  if (existing) {
    revalidateCustomerPaths(existing.id, [partnerId]);
    return;
  }
  const customer = await db.customer.create({
    data: {
      name: partner.name,
      status: "ACTIVE",
      partnerRelation: "SELF",
      city: partner.city,
      country: partner.country,
      website: partner.website,
      crmCustomerId: partner.crmCustomerId,
      kmsRootPath: partner.kmsRootPath,
      createdById: user.id,
      partnerLinks: { create: { partnerId, relation: "SELF" } },
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
