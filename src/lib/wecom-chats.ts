import { db } from "@/lib/db";

export type WecomChatRow = {
  id: string;
  chatId: string;
  chatType: string;
  label: string | null;
  partnerId: string | null;
  partnerName: string | null;
  customerId: string | null;
  customerName: string | null;
  lastSeenAt: string;
};

export type BindableEntityRow = {
  id: string;
  name: string;
  createdAt: Date;
};

const RECENT_BINDABLE_LIMIT = 10;

function stripBotMention(text: string) {
  return text.replace(/@[^\s]+/g, "").trim();
}

/** 收到消息或入群时自动登记会话（群聊会记录 chatId） */
export async function registerWecomChat(input: {
  chatId?: string | null;
  chatType?: string | null;
  fromUserId?: string | null;
  text?: string | null;
}) {
  const chatType = input.chatType === "group" ? "group" : "single";
  const chatId =
    chatType === "group"
      ? input.chatId?.trim()
      : input.fromUserId?.trim() ?? input.chatId?.trim();
  if (!chatId) return null;

  const snippet = stripBotMention(input.text ?? "").slice(0, 80);
  const existing = await db.wecomChat.findUnique({ where: { chatId } });

  return db.wecomChat.upsert({
    where: { chatId },
    create: {
      chatId,
      chatType,
      label: chatType === "group" ? snippet || null : null,
      lastSeenAt: new Date(),
    },
    update: {
      chatType,
      lastSeenAt: new Date(),
      ...(chatType === "group" && snippet && !existing?.label ? { label: snippet } : {}),
    },
    include: {
      partner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });
}

function mapWecomChatRow(
  r: {
    id: string;
    chatId: string;
    chatType: string;
    label: string | null;
    partnerId: string | null;
    customerId: string | null;
    lastSeenAt: Date;
    partner?: { name: string } | null;
    customer?: { name: string } | null;
  },
): WecomChatRow {
  return {
    id: r.id,
    chatId: r.chatId,
    chatType: r.chatType,
    label: r.label,
    partnerId: r.partnerId,
    partnerName: r.partner?.name ?? null,
    customerId: r.customerId,
    customerName: r.customer?.name ?? null,
    lastSeenAt: r.lastSeenAt.toISOString(),
  };
}

export async function listWecomChats(): Promise<WecomChatRow[]> {
  const rows = await db.wecomChat.findMany({
    orderBy: { lastSeenAt: "desc" },
    include: {
      partner: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });
  return rows.map(mapWecomChatRow);
}

export async function listRecentBindableCustomers(limit = RECENT_BINDABLE_LIMIT): Promise<BindableEntityRow[]> {
  return db.customer.findMany({
    where: {
      status: { not: "INACTIVE" },
      wecomChat: null,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, createdAt: true },
  });
}

export async function listRecentBindablePartners(limit = RECENT_BINDABLE_LIMIT): Promise<BindableEntityRow[]> {
  return db.partner.findMany({
    where: {
      status: { not: "ARCHIVED" },
      wecomChat: null,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, createdAt: true },
  });
}

export async function bindWecomChatToPartner(chatId: string, partnerId: string | null, label?: string) {
  if (partnerId) {
    await db.wecomChat.updateMany({
      where: { partnerId, chatId: { not: chatId } },
      data: { partnerId: null },
    });
  }
  const chat = await db.wecomChat.findUnique({ where: { chatId } });
  if (!chat) {
    return db.wecomChat.create({
      data: {
        chatId,
        chatType: "group",
        partnerId,
        customerId: partnerId ? null : undefined,
        label: label?.trim() || null,
      },
      include: {
        partner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
  }
  return db.wecomChat.update({
    where: { chatId },
    data: {
      partnerId,
      ...(partnerId ? { customerId: null } : {}),
      ...(label?.trim() ? { label: label.trim() } : {}),
    },
    include: {
      partner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });
}

export async function bindWecomChatToCustomer(chatId: string, customerId: string | null, label?: string) {
  if (customerId) {
    await db.wecomChat.updateMany({
      where: { customerId, chatId: { not: chatId } },
      data: { customerId: null },
    });
  }
  const chat = await db.wecomChat.findUnique({ where: { chatId } });
  if (!chat) {
    return db.wecomChat.create({
      data: {
        chatId,
        chatType: "group",
        customerId,
        partnerId: customerId ? null : undefined,
        label: label?.trim() || null,
      },
      include: {
        partner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
    });
  }
  return db.wecomChat.update({
    where: { chatId },
    data: {
      customerId,
      ...(customerId ? { partnerId: null } : {}),
      ...(label?.trim() ? { label: label.trim() } : {}),
    },
    include: {
      partner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });
}

export async function getWecomChatForPartner(partnerId: string) {
  return db.wecomChat.findUnique({
    where: { partnerId },
  });
}

export async function getWecomChatForCustomer(customerId: string) {
  return db.wecomChat.findUnique({
    where: { customerId },
  });
}

export async function getWecomChatByChatId(chatId: string) {
  return db.wecomChat.findUnique({
    where: { chatId },
    include: {
      partner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
    },
  });
}
