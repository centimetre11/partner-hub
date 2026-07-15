import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { markPartnerDiscussed } from "@/lib/partner-review/discuss-partner";

export const runtime = "nodejs";

/** 会中打标：Route Handler，避免 Server Action 部署哈希不一致导致切伙伴失败 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: meetingId } = await ctx.params;
  let itemId = "";
  try {
    const body = (await req.json()) as { itemId?: string };
    itemId = String(body.itemId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "无效请求体" }, { status: 400 });
  }
  if (!itemId) return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });

  const res = await markPartnerDiscussed(meetingId, itemId);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json(res);
}
