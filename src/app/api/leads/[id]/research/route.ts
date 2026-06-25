import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getLeadResearch, parseLeadResearchJson, runLeadResearch } from "@/lib/lead-research";

export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const research = await getLeadResearch(id);
  if (!research) return NextResponse.json({ research: null });

  return NextResponse.json({
    research: {
      ...research,
      structured: parseLeadResearchJson(research.resultJson),
    },
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const result = await runLeadResearch(id, uid);

  if (!result.ok) {
    const status = result.needsWebSearch ? 503 : 400;
    return NextResponse.json({ ok: false, error: result.error, needsWebSearch: result.needsWebSearch }, { status });
  }

  return NextResponse.json({
    ok: true,
    research: {
      ...result.research,
      structured: result.structured,
    },
  });
}
