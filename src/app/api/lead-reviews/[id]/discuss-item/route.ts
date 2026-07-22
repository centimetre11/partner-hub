import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { markLeadDiscussed } from "@/lib/lead-review/discuss-item";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  if (!body.itemId) return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });

  const result = await markLeadDiscussed(meetingId, body.itemId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
