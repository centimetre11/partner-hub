import { NextRequest, NextResponse } from "next/server";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { runAutomationBuilderTurn, type AutomationBuilderMessage } from "@/lib/automation-builder";
import { getLocale } from "@/lib/i18n/locale-server";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { messages, stream, deliveryPrefs } = (await req.json()) as {
    messages: AutomationBuilderMessage[];
    stream?: boolean;
    deliveryPrefs?: Partial<import("@/lib/builder-context-prompt").BuilderDeliveryPrefs>;
  };
  if (!Array.isArray(messages)) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  const locale = await getLocale();

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const turn = await runAutomationBuilderTurn({ messages, userId: uid, emit, locale, deliveryPrefs });
        emit({ event: "done", data: turn });
      });
    }
    const turn = await runAutomationBuilderTurn({ messages, userId: uid, locale, deliveryPrefs });
    return NextResponse.json(turn);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `Build failed: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
