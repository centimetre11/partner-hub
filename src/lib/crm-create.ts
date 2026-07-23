"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import { recordSystemEvent } from "./activity-log";
import { ACTIVE_PARTNER_DEFAULTS } from "./partner-onboarding";

export type CrmCustomerContact = {
  name: string | null;
  mobile: string | null;
  email: string | null;
  duty: string | null;
};

export type CrmCustomerDetail = {
  id: string;
  name: string;
  province: string | null;
  city: string | null;
  status: string | null;
  salesman: string | null;
  presales: string | null;
  projectManager: string | null;
  contact: CrmCustomerContact | null;
  /** 帆软 CRM 销售/售前英文名映射到的本地成员（可能为空） */
  salesUserId: string | null;
  presalesUserId: string | null;
  /** 喂给 AI 建档面板的种子文本 */
  seedText: string;
};

export type CrmDupMatch = {
  id: string;
  name: string;
  matchBy: "crmId" | "name";
};

async function resolveCrmUserId(name: string | null | undefined): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const user = await db.user.findFirst({
    where: { crmSalesmanName: n },
    select: { id: true },
  });
  return user?.id ?? null;
}

function buildSeedText(
  c: { id: string; name: string; province: string | null; city: string | null; status: string | null; salesman: string | null; presales: string | null; projectManager: string | null },
  contact: CrmCustomerContact | null,
): string {
  const lines: string[] = [`公司名称：${c.name}`];
  const region = [c.province, c.city].filter(Boolean).join(" · ");
  if (region) lines.push(`地区：${region}`);
  if (c.status) lines.push(`CRM 状态：${c.status}`);
  if (c.salesman) lines.push(`销售负责人：${c.salesman}`);
  if (c.presales) lines.push(`售前：${c.presales}`);
  if (c.projectManager) lines.push(`项目经理：${c.projectManager}`);
  if (contact?.name) {
    const parts = [contact.name];
    if (contact.duty) parts.push(`（${contact.duty}）`);
    const reach = [contact.mobile, contact.email].filter(Boolean).join(" / ");
    if (reach) parts.push(` ${reach}`);
    lines.push(`联系人：${parts.join("")}`);
  }
  lines.push(`帆软 CRM 客户 ID：${c.id}`);
  return lines.join("\n");
}

async function loadCrmDetail(comId: string): Promise<CrmCustomerDetail | null> {
  const id = comId.trim();
  if (!id) return null;
  const c = await db.crmCustomer.findUnique({
    where: { id },
    include: { contacts: { orderBy: { recdate: "desc" }, take: 1 } },
  });
  if (!c) return null;
  const raw = c.contacts[0] ?? null;
  const contact: CrmCustomerContact | null = raw
    ? { name: raw.name, mobile: raw.mobile, email: raw.email, duty: raw.duty }
    : null;
  const [salesUserId, presalesUserId] = await Promise.all([
    resolveCrmUserId(c.salesman),
    resolveCrmUserId(c.presales),
  ]);
  return {
    id: c.id,
    name: c.name,
    province: c.province,
    city: c.city,
    status: c.status,
    salesman: c.salesman,
    presales: c.presales,
    projectManager: c.projectManager,
    contact,
    salesUserId,
    presalesUserId,
    seedText: buildSeedText(c, contact),
  };
}

export async function getCrmCustomerDetailAction(comId: string): Promise<CrmCustomerDetail | null> {
  await requireUser();
  return loadCrmDetail(comId);
}

/** 按 com_id / 公司名，在本地伙伴与客户里查可能重复的档案（供确认） */
export async function findEntitiesByCrmCustomerAction(comId: string, name: string) {
  await requireUser();
  const id = comId.trim();
  const nm = name.trim();
  const where = <T,>(): T =>
    ({
      OR: [
        ...(id ? [{ crmCustomerId: id }] : []),
        ...(nm ? [{ name: nm }] : []),
      ],
    }) as T;

  const [partners, customers] = await Promise.all([
    db.partner.findMany({
      where: where<Prisma.PartnerWhereInput>(),
      select: { id: true, name: true, crmCustomerId: true },
    }),
    db.customer.findMany({
      where: where<Prisma.CustomerWhereInput>(),
      select: { id: true, name: true, crmCustomerId: true },
    }),
  ]);

  const tag = (e: { id: string; name: string; crmCustomerId: string | null }): CrmDupMatch => ({
    id: e.id,
    name: e.name,
    matchBy: id && e.crmCustomerId === id ? "crmId" : "name",
  });

  return { partners: partners.map(tag), customers: customers.map(tag) };
}

type CreateResult = { id: string } | { error: string };

/** 从 CRM 客户直接创建「客户」档案（映射清晰的字段一步到位） */
export async function createCustomerFromCrmAction(comId: string): Promise<CreateResult> {
  const user = await requireUser();
  const detail = await loadCrmDetail(comId);
  if (!detail) return { error: "CRM 客户不存在，请先执行 CRM 同步" };

  const customer = await db.customer.create({
    data: {
      name: detail.name,
      status: "PROSPECT",
      city: detail.city ?? detail.province,
      crmCustomerId: detail.id,
      ownerId: detail.salesUserId,
      presalesUserId: detail.presalesUserId,
      contactName: detail.contact?.name ?? null,
      contactTitle: detail.contact?.duty ?? null,
      contactPhone: detail.contact?.mobile ?? null,
      contactEmail: detail.contact?.email ?? null,
      createdById: user.id,
      ...(detail.contact?.name
        ? {
            contacts: {
              create: {
                name: detail.contact.name,
                title: detail.contact.duty ?? undefined,
                phone: detail.contact.mobile ?? undefined,
                email: detail.contact.email ?? undefined,
                contactInfo:
                  [detail.contact.mobile, detail.contact.email].filter(Boolean).join(" / ") || undefined,
              },
            },
          }
        : {}),
    },
  });

  void recordSystemEvent({
    category: "CUSTOMER",
    action: "customer.create_from_crm",
    actorId: user.id,
    actorLabel: user.name,
    targetType: "Customer",
    targetId: customer.id,
    targetLabel: customer.name,
    summary: `从 CRM 创建客户：${customer.name}`,
    meta: { crmCustomerId: detail.id },
  });

  revalidatePath("/customers");
  return { id: customer.id };
}

/** 从 CRM 客户直接创建「伙伴」档案（正式伙伴，画像字段留空待补） */
export async function createPartnerFromCrmAction(
  comId: string,
  opts?: { parentId?: string },
): Promise<CreateResult> {
  const user = await requireUser();
  const detail = await loadCrmDetail(comId);
  if (!detail) return { error: "CRM 客户不存在，请先执行 CRM 同步" };

  const parentId = opts?.parentId?.trim() || null;
  if (parentId) {
    const { assertTwoLevelHierarchy } = await import("./partner-hierarchy");
    const check = await assertTwoLevelHierarchy(null, parentId);
    if (!check.ok) return { error: check.error };
  }

  try {
    const partner = await db.partner.create({
      data: {
        name: detail.name,
        category: "OTHER",
        city: detail.city ?? detail.province ?? undefined,
        crmCustomerId: detail.id,
        salesUserId: detail.salesUserId ?? undefined,
        presalesUserId: detail.presalesUserId ?? undefined,
        parentId,
        ...ACTIVE_PARTNER_DEFAULTS,
        promotedAt: new Date(),
        ...(detail.contact?.name
          ? {
              contacts: {
                create: {
                  name: detail.contact.name,
                  title: detail.contact.duty ?? undefined,
                  phone: detail.contact.mobile ?? undefined,
                  email: detail.contact.email ?? undefined,
                  contactInfo:
                    [detail.contact.mobile, detail.contact.email].filter(Boolean).join(" / ") || undefined,
                },
              },
            }
          : {}),
      },
    });

    await db.timelineEvent.create({
      data: {
        partnerId: partner.id,
        type: "SYSTEM",
        title: "Created from CRM",
        content: `${partner.name} 从 CRM 客户创建（com_id: ${detail.id}）`,
        createdById: user.id,
      },
    });

    void recordSystemEvent({
      category: "PARTNER",
      action: "partner.create_from_crm",
      actorId: user.id,
      actorLabel: user.name,
      targetType: "Partner",
      targetId: partner.id,
      targetLabel: partner.name,
      summary: `从 CRM 创建伙伴：${partner.name}`,
      meta: { crmCustomerId: detail.id, parentId },
    });

    revalidatePath("/partners");
    revalidatePath("/pool");
    if (parentId) revalidatePath(`/partners/${parentId}`);
    return { id: partner.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: `伙伴「${detail.name}」已存在，请打开已有档案或改用其他名称` };
    }
    throw e;
  }
}
