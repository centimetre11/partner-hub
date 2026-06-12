import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { applyProposal, type ExtractionProposal } from "@/lib/proposals";

// 人工确认提案后写库（diff 确认机制的落库端）
export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { partnerId, proposal, eventType, sourceText } = (await req.json()) as {
    partnerId: string;
    proposal: ExtractionProposal;
    eventType?: string;
    sourceText?: string;
  };
  if (!partnerId || !proposal) return NextResponse.json({ error: "参数缺失" }, { status: 400 });

  try {
    const result = await applyProposal({
      partnerId,
      proposal,
      userId: uid,
      eventType: eventType || "CHAT_IMPORT",
      sourceText,
    });
    revalidatePath(`/partners/${partnerId}`);
    revalidatePath("/partners");
    revalidatePath("/todos");
    revalidatePath("/");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: `写入失败：${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
