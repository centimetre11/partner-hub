"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

async function ensureProfile(customerId: string) {
  return db.arrCustomerProfile.upsert({
    where: { customerId },
    create: { customerId },
    update: {},
  });
}

export async function upsertArrCalendarCellAction(formData: FormData) {
  await requireUser();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const content = String(formData.get("content") ?? "").trim();

  if (!customerId || !Number.isFinite(year) || month < 1 || month > 12) {
    return { ok: false as const, error: "invalid_input" };
  }

  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { ok: false as const, error: "customer_not_found" };

  const profile = await ensureProfile(customerId);
  // Monthly grid is notes-only; ignore legacy kind dropdown / content inference.
  const kind = "NOTE";

  if (!content) {
    await db.arrCalendarCell.deleteMany({
      where: { profileId: profile.id, year, month },
    });
  } else {
    await db.arrCalendarCell.upsert({
      where: { profileId_year_month: { profileId: profile.id, year, month } },
      create: { profileId: profile.id, year, month, content, kind },
      update: { content, kind },
    });
  }

  revalidatePath("/arr/calendar");
  revalidatePath("/arr");
  return { ok: true as const };
}

export async function upsertArrCustomerProfileAction(formData: FormData) {
  await requireUser();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) return { ok: false as const, error: "invalid_input" };

  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { ok: false as const, error: "customer_not_found" };

  const situation = formData.has("situation")
    ? String(formData.get("situation") ?? "").trim() || null
    : undefined;
  const todo = formData.has("todo")
    ? String(formData.get("todo") ?? "").trim() || null
    : undefined;
  const latestRaw = formData.has("latestServiceAt")
    ? String(formData.get("latestServiceAt") ?? "").trim()
    : undefined;
  const latestServiceAt =
    latestRaw === undefined
      ? undefined
      : latestRaw
        ? new Date(latestRaw)
        : null;

  await db.arrCustomerProfile.upsert({
    where: { customerId },
    create: {
      customerId,
      situation: situation ?? null,
      todo: todo ?? null,
      latestServiceAt: latestServiceAt ?? null,
    },
    update: {
      ...(situation !== undefined ? { situation } : {}),
      ...(todo !== undefined ? { todo } : {}),
      ...(latestServiceAt !== undefined ? { latestServiceAt } : {}),
    },
  });

  revalidatePath("/arr/calendar");
  revalidatePath("/arr");
  return { ok: true as const };
}

/** Seed a renewal-reminder cell from an ARR contract renewsAt / endDate. */
export async function seedRenewalRemindersAction(year: number, _formData?: FormData) {
  await requireUser();
  if (!Number.isFinite(year)) return;

  const contracts = await db.contract.findMany({
    where: {
      status: "ACTIVE",
      contractType: { in: ["SUBSCRIPTION", "PRODUCT_MAINTENANCE", "PROJECT_MAINTENANCE"] },
      OR: [
        { renewsAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
        { endDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
      ],
    },
    select: {
      id: true,
      name: true,
      customerId: true,
      renewsAt: true,
      endDate: true,
      contractType: true,
    },
  });

  for (const ct of contracts) {
    const when = ct.renewsAt ?? ct.endDate;
    if (!when) continue;
    const d = new Date(when);
    if (d.getFullYear() !== year) continue;
    const month = d.getMonth() + 1;
    const profile = await ensureProfile(ct.customerId);
    const existing = await db.arrCalendarCell.findUnique({
      where: { profileId_year_month: { profileId: profile.id, year, month } },
    });
    if (existing?.content?.trim()) continue;
    const label =
      ct.contractType === "SUBSCRIPTION"
        ? "续费提醒"
        : ct.contractType === "PRODUCT_MAINTENANCE"
          ? "产品维保续费"
          : "项目维保续费";
    await db.arrCalendarCell.create({
      data: {
        profileId: profile.id,
        year,
        month,
        content: `${label}：${ct.name}`,
        kind: "NOTE",
      },
    });
  }

  revalidatePath("/arr/calendar");
}
