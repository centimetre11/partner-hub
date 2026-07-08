"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const BIND_CODE_TTL_MS = 15 * 60 * 1000;

function randomBindCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export async function generateCustomerWecomChatBindCodeAction(customerId: string) {
  await requireUser();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) return { error: "客户不存在" };

  const code = randomBindCode();
  const expiresAt = new Date(Date.now() + BIND_CODE_TTL_MS);

  await db.customer.update({
    where: { id: customerId },
    data: {
      wecomChatBindCode: code,
      wecomChatBindCodeExpiresAt: expiresAt,
    },
  });

  revalidatePath(`/customers/${customerId}`);
  return {
    ok: true as const,
    code,
    expiresAt: expiresAt.toISOString(),
    message: `绑定码 ${code} 已生成，15 分钟内有效。请在企微群发送：@机器人 绑定客户 ${code}`,
  };
}

export async function generatePartnerWecomChatBindCodeAction(partnerId: string) {
  await requireUser();
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true },
  });
  if (!partner) return { error: "伙伴不存在" };

  const code = randomBindCode();
  const expiresAt = new Date(Date.now() + BIND_CODE_TTL_MS);

  await db.partner.update({
    where: { id: partnerId },
    data: {
      wecomChatBindCode: code,
      wecomChatBindCodeExpiresAt: expiresAt,
    },
  });

  revalidatePath(`/partners/${partnerId}`);
  return {
    ok: true as const,
    code,
    expiresAt: expiresAt.toISOString(),
    message: `绑定码 ${code} 已生成，15 分钟内有效。请在企微群发送：@机器人 绑定伙伴 ${code}`,
  };
}
