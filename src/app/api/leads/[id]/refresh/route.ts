import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { refreshLeadById } from "@/lib/leads-sync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const result = await refreshLeadById(id);

  if (!result.ok) {
    const status = result.reason === "no_clue_id" ? 400 : 502;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
