import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { AIError } from "@/lib/ai";
import { extractProposal, guessPartner } from "@/lib/proposals";

// 从任意文本（聊天记录/会议速记/邮件/新闻）抽取信息，生成待确认的提案
export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { text, partnerId, sourceType } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "文本为空" }, { status: 400 });

  try {
    let pid = partnerId as string | undefined;
    let guess: { partnerId: string | null; partnerName: string | null; confidence: string } | null = null;
    if (!pid) {
      guess = await guessPartner(text, uid);
      if (!guess.partnerId) {
        return NextResponse.json({ error: "AI 无法判断这段文本属于哪个伙伴，请手动选择伙伴后重试。", needPartner: true }, { status: 422 });
      }
      pid = guess.partnerId;
    }

    const proposal = await extractProposal({
      partnerId: pid,
      text,
      sourceType: sourceType || "聊天记录",
      today: new Date().toISOString().slice(0, 10),
      userId: uid,
    });
    return NextResponse.json({ proposal: { ...proposal, partnerId: pid }, guess });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `处理失败：${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
