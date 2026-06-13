import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { AIError } from "@/lib/ai";
import { runIntakeTurn, type IntakeScope, type IntakeMessage } from "@/lib/ai-intake";

const SCOPES: IntakeScope[] = ["new_partner", "powermap", "opportunity", "profile", "training", "todo", "solution"];

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { scope, partnerId, messages } = await req.json();
  if (!SCOPES.includes(scope)) return NextResponse.json({ error: "无效的录入类型" }, { status: 400 });
  if (!Array.isArray(messages) || !messages.length) {
    return NextResponse.json({ error: "对话内容为空" }, { status: 400 });
  }

  try {
    const turn = await runIntakeTurn({
      scope,
      partnerId: partnerId || undefined,
      messages: messages as IntakeMessage[],
      today: new Date().toISOString().slice(0, 10),
      userId: uid,
    });
    return NextResponse.json(turn);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `处理失败：${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
