import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { AIError } from "@/lib/ai";
import { extractProposal, guessPartner } from "@/lib/proposals";
import { getLocale } from "@/lib/i18n/locale-server";

// Extract information from any text (chat logs / meeting notes / email / news) and build a proposal for confirmation
export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { text, partnerId, sourceType } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Text is empty" }, { status: 400 });

  try {
    const locale = await getLocale();
    let pid = partnerId as string | undefined;
    let guess: { partnerId: string | null; partnerName: string | null; confidence: string } | null = null;
    if (!pid) {
      guess = await guessPartner(text, uid);
      if (!guess.partnerId) {
        return NextResponse.json({ error: "AI could not determine which partner this text belongs to. Please select a partner and try again.", needPartner: true }, { status: 422 });
      }
      pid = guess.partnerId;
    }

    const proposal = await extractProposal({
      partnerId: pid,
      text,
      sourceType: sourceType || "chat log",
      today: new Date().toISOString().slice(0, 10),
      userId: uid,
      locale,
    });
    return NextResponse.json({ proposal: { ...proposal, partnerId: pid }, guess });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `Processing failed: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
