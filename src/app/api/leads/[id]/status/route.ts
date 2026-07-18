import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

/** 轻量检查线索是否仍在 Hub 本地库（供详情页轮询 / 切回标签页时检测） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const lead = await db.crmLead.findUnique({
    where: { id },
    select: { id: true },
  });

  return NextResponse.json({ exists: Boolean(lead) });
}
