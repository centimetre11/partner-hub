import { db } from "@/lib/db";

export type WecomChatRow = {
  id: string;
  chatId: string;
  chatType: string;
  label: string | null;
  partnerId: string | null;
  partnerName: string | null;
  lastSeenAt: string;
};

function stripBotMention(text: string) {
  return text.replace(/@[^\s]+/g, "").trim();
}

/** 收到消息时自动登记会话（群聊会记录 chatId） */
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

export async function listWecomChats(): Promise<WecomChatRow[]> {
  const rows = await db.wecomChat.findMany({
    orderBy: { lastSeenAt: "desc" },
    include: { partner: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    chatId: r.chatId,
    chatType: r.chatType,
    label: r.label,
    partnerId: r.partnerId,
    partnerName: r.partner?.name ?? null,
    lastSeenAt: r.lastSeenAt.toISOString(),
  }));
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
        label: label?.trim() || null,
      },
      include: { partner: { select: { id: true, name: true } } },
    });
  }
  return db.wecomChat.update({
    where: { chatId },
    data: {
      partnerId,
      ...(label?.trim() ? { label: label.trim() } : {}),
    },
    include: { partner: { select: { id: true, name: true } } },
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
        label: label?.trim() || null,
      },
      include: { customer: { select: { id: true, name: true } } },
    });
  }
  return db.wecomChat.update({
    where: { chatId },
    data: {
      customerId,
      ...(label?.trim() ? { label: label.trim() } : {}),
    },
    include: { customer: { select: { id: true, name: true } } },
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
  return db.wecomChat.findUnique({ where: { chatId } });
}
