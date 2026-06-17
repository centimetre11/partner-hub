import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { runAgentBuilderTurn, type AgentBuilderMessage } from "@/lib/agent-builder";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { messages, stream } = (await req.json()) as { messages: AgentBuilderMessage[]; stream?: boolean };
  if (!Array.isArray(messages)) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const turn = await runAgentBuilderTurn({ messages, userId: uid, emit });
        emit({ event: "done", data: turn });
      });
    }
    const turn = await runAgentBuilderTurn({ messages, userId: uid });
    return NextResponse.json(turn);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `Build failed: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
