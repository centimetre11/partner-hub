import { NextResponse } from "next/server";
import { listWecomChats } from "@/lib/wecom-chats";
import { requireUser } from "@/lib/session";

export async function GET() {
  await requireUser();
  const chats = await listWecomChats();
  return NextResponse.json({ chats });
}
