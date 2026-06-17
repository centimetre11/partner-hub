import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { applyIntake, type IntakeScope, type IntakeProposal } from "@/lib/ai-intake";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { scope, partnerId, proposal, sourceText, intent } = await req.json();
  if (!proposal) return NextResponse.json({ error: "Missing proposal" }, { status: 400 });

  try {
    const result = await applyIntake({
      scope: scope as IntakeScope,
      partnerId: partnerId || undefined,
      proposal: proposal as IntakeProposal,
      userId: uid,
      sourceText,
      intent: intent === "active" ? "active" : "prospect",
    });
    revalidatePath("/pool");
    revalidatePath("/partners");
    revalidatePath("/todos");
    if (result.partnerId) revalidatePath(`/partners/${result.partnerId}`);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Failed to save: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
