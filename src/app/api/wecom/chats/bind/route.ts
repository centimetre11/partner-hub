import { NextRequest, NextResponse } from "next/server";
import { bindWecomChatToPartner, bindWecomChatToCustomer } from "@/lib/wecom-chats";
import { requireUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = (await req.json()) as {
    chatId?: string;
    partnerId?: string | null;
    customerId?: string | null;
    label?: string;
  };
  const chatId = body.chatId?.trim();
  if (!chatId) return NextResponse.json({ error: "缺少 chatId" }, { status: 400 });

  // customerId 字段存在时走客户绑定，否则按伙伴绑定
  const chat = "customerId" in body
    ? await bindWecomChatToCustomer(chatId, body.customerId?.trim() || null, body.label)
    : await bindWecomChatToPartner(chatId, body.partnerId?.trim() || null, body.label);
  return NextResponse.json({ chat });
}
