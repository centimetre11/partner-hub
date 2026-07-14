import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { applyPartnerReviewConfirm, type ConfirmItemPayload } from "@/lib/partner-review/apply";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    meetingId?: string;
    items?: ConfirmItemPayload[];
  };
  const meetingId = String(body.meetingId ?? "").trim();
  if (!meetingId || !Array.isArray(body.items)) {
    return NextResponse.json({ ok: false, error: "meetingId and items required" }, { status: 400 });
  }

  try {
    const results = await applyPartnerReviewConfirm({
      meetingId,
      userId: uid,
      items: body.items,
    });
    revalidatePath(`/partner-reviews/${meetingId}`);
    revalidatePath("/partner-reviews");
    revalidatePath("/partners");
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
