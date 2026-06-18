import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import {
  runProposeTurn,
  shouldUseProposeMode,
  type IntakeMessage,
} from "@/lib/ai-intake";
import { runQueryAssistant } from "@/lib/assistant-core";
import { getLocale } from "@/lib/i18n/locale-server";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json()) as {
    messages: IntakeMessage[];
    stream?: boolean;
    partnerId?: string;
    forcePropose?: boolean;
  };
  const { messages, stream, partnerId, forcePropose } = body;

  const usePropose = forcePropose || shouldUseProposeMode(messages);
  const locale = await getLocale();

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const result = usePropose
          ? await runProposeTurn({ messages, partnerId, userId: uid, emit, locale })
          : await runQueryAssistant(messages, uid, { emit });
        emit({ event: "done", data: result });
      });
    }
    const result = usePropose
      ? await runProposeTurn({ messages, partnerId, userId: uid, locale })
      : await runQueryAssistant(messages, uid);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `Assistant error: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
