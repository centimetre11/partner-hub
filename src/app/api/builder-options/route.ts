import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listWecomChats } from "@/lib/wecom-chats";
import { requireUser } from "@/lib/session";
import { END_CUSTOMER_WHERE } from "@/lib/customer-filters";

export async function GET() {
  const user = await requireUser();
  const [chats, users, partners, customers] = await Promise.all([
    listWecomChats(),
    db.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    db.customer.findMany({
      where: { ...END_CUSTOMER_WHERE, status: { not: "INACTIVE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  const groupChats = chats.filter((c) => c.chatType === "group");
  const emails = users.map((u) => ({ id: u.id, name: u.name, email: u.email })).filter((u) => u.email);
  const sortedEmails = [
    ...emails.filter((u) => u.id === user.id),
    ...emails.filter((u) => u.id !== user.id),
  ];

  return NextResponse.json({
    wecomChats: groupChats.map((c) => ({
      chatId: c.chatId,
      label: c.label,
      partnerName: c.partnerName,
      partnerId: c.partnerId,
    })),
    emails: sortedEmails,
    partners,
    customers,
    assignees: users.map((u) => ({ id: u.id, name: u.name })),
  });
}
