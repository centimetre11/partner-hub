import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import type { IntakeMessage } from "@/lib/ai-intake";
import { runAssistantTurn } from "@/lib/assistant-router";
import { getLocale } from "@/lib/i18n/locale-server";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json()) as {
    messages: IntakeMessage[];
    stream?: boolean;
    partnerId?: string;
    forcePropose?: boolean;
    confirmedActionId?: string;
    skipIntentConfirm?: boolean;
  };
  const { messages, stream, partnerId, forcePropose, confirmedActionId, skipIntentConfirm } = body;
  const locale = await getLocale();

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const result = await runAssistantTurn({
          messages,
          userId: uid,
          partnerId,
          locale,
          feature: "Global AI Assistant",
          emit,
          forcePropose,
          confirmedActionId,
          skipIntentConfirm,
        });
        emit({ event: "done", data: result });
      });
    }
    const result = await runAssistantTurn({
      messages,
      userId: uid,
      partnerId,
      locale,
      feature: "Global AI Assistant",
      forcePropose,
      confirmedActionId,
      skipIntentConfirm,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `Assistant error: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
