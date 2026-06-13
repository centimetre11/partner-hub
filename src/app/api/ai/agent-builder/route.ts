import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai";
import { runAgentBuilderTurn, type AgentBuilderMessage } from "@/lib/agent-builder";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { messages } = (await req.json()) as { messages: AgentBuilderMessage[] };
  if (!Array.isArray(messages)) return NextResponse.json({ error: "对话内容无效" }, { status: 400 });

  try {
    const turn = await runAgentBuilderTurn({ messages, userId: uid });
    return NextResponse.json(turn);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `构建失败：${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
