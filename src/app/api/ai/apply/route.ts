import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { applyProposal, type ExtractionProposal } from "@/lib/proposals";

// Persist a human-confirmed proposal (save endpoint for diff confirmation flow)
export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { partnerId, proposal, eventType, sourceText } = (await req.json()) as {
    partnerId: string;
    proposal: ExtractionProposal;
    eventType?: string;
    sourceText?: string;
  };
  if (!partnerId || !proposal) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

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
    return NextResponse.json({ error: `Failed to save: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
