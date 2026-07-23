import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { markItemDiscussed } from "@/lib/presales-meeting/discuss-item";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });

  const res = await markItemDiscussed(meetingId, itemId);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
