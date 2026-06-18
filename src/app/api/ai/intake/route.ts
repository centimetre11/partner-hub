import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { runIntakeTurn, type IntakeScope, type IntakeMessage } from "@/lib/ai-intake";
import { getLocale } from "@/lib/i18n/locale-server";

const SCOPES: IntakeScope[] = ["new_partner", "powermap", "opportunity", "profile", "training", "solution"];

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { scope, partnerId, messages, stream } = await req.json();
  if (!SCOPES.includes(scope)) return NextResponse.json({ error: "Invalid intake scope" }, { status: 400 });
  if (!Array.isArray(messages) || !messages.length) {
    return NextResponse.json({ error: "Conversation is empty" }, { status: 400 });
  }

  const locale = await getLocale();
  const base = {
    scope: scope as IntakeScope,
    partnerId: partnerId || undefined,
    messages: messages as IntakeMessage[],
    today: new Date().toISOString().slice(0, 10),
    userId: uid,
    locale,
  };

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const turn = await runIntakeTurn({ ...base, emit });
        emit({ event: "done", data: turn });
      });
    }
    const turn = await runIntakeTurn(base);
    return NextResponse.json(turn);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `Processing failed: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
