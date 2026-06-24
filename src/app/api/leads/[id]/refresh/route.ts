import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { refreshLeadById } from "@/lib/leads-sync";
import type { CrmLeadAction } from "@/lib/leads";

const VALID_ACTIONS = new Set<CrmLeadAction>([
  "toNurture",
  "toChannel",
  "toCustomer",
  "edit",
  "shift",
  "view",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const rawAction = req.nextUrl.searchParams.get("action");
  const action =
    rawAction && VALID_ACTIONS.has(rawAction as CrmLeadAction)
      ? (rawAction as CrmLeadAction)
      : undefined;

  const result = await refreshLeadById(id, action);

  if (!result.ok) {
    const status = result.reason === "no_clue_id" ? 400 : 502;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
