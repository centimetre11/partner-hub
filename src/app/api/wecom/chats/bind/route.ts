import { NextRequest, NextResponse } from "next/server";
import { bindWecomChatToPartner } from "@/lib/wecom-chats";
import { requireUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = (await req.json()) as {
    chatId?: string;
    partnerId?: string | null;
    label?: string;
  };
  const chatId = body.chatId?.trim();
  if (!chatId) return NextResponse.json({ error: "缺少 chatId" }, { status: 400 });

  const chat = await bindWecomChatToPartner(
    chatId,
    body.partnerId?.trim() || null,
    body.label
  );
  return NextResponse.json({ chat });
}
