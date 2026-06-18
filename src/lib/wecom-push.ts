import { db } from "@/lib/db";
import { getWecomChatForPartner } from "@/lib/wecom-chats";

export async function enqueueWecomPush(chatId: string, content: string) {
  const text = content.trim();
  if (!text) throw new Error("推送内容不能为空");
  if (text.length > 20000) throw new Error("推送内容过长（上限 20000 字符）");
  return db.wecomPushJob.create({
    data: { chatId, content: text },
  });
}

export async function enqueueWecomPushForPartner(partnerId: string, content: string) {
  const chat = await getWecomChatForPartner(partnerId);
  if (!chat) throw new Error("该伙伴尚未绑定企微群，请先在伙伴页面绑定群 Chat ID");
  return enqueueWecomPush(chat.chatId, content);
}

export async function claimPendingWecomPushJobs(limit = 10) {
  return db.wecomPushJob.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function markWecomPushJob(
  id: string,
  status: "SENT" | "FAILED",
  error?: string
) {
  return db.wecomPushJob.update({
    where: { id },
    data: {
      status,
      error: error?.slice(0, 500) ?? null,
      sentAt: status === "SENT" ? new Date() : undefined,
    },
  });
}
