import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { chatJson, AIError } from "@/lib/ai";
import { partnerContext } from "@/lib/proposals";
import { computeCompleteness } from "@/lib/completeness";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { partnerId } = await req.json();

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    include: { contacts: true, opportunities: true, events: true, trainings: true },
  });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  const { missing } = computeCompleteness(partner);
  const ctx = await partnerContext(partnerId);

  try {
    const res = await chatJson<{ questions: string[] }>(
      `You are a sales coach for Fanruan Software Middle East BD. Based on gaps in the partner profile, generate questions to ask on the next touchpoint (in English, 6-10 questions).
Requirements: questions should feel natural, specific, and usable in a business conversation; prioritize missing critical info (decision chain, opportunities, competitor stance, client resources); tailor to this partner's context — avoid generic questions.
Output JSON only: {"questions": ["question 1", "question 2", ...]}`,
      `${ctx}\n\n[Current profile gaps]\n${missing.join(", ") || "No obvious gaps"}`,
      { feature: "Gap-filling question list", userId: uid }
    );
    return NextResponse.json({ questions: res.questions ?? [] });
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "Generation failed — please try again later";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
