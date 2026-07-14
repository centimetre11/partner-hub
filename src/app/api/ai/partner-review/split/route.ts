import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { buildSplitProposal, persistSplitDrafts } from "@/lib/partner-review/split";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { meetingId?: string; persist?: boolean };
  const meetingId = String(body.meetingId ?? "").trim();
  if (!meetingId) {
    return NextResponse.json({ ok: false, error: "meetingId required" }, { status: 400 });
  }

  const meeting = await db.partnerReviewMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "会议不存在" }, { status: 404 });
  }

  try {
    const proposal = await buildSplitProposal(meetingId, uid);
    if (body.persist !== false) {
      await persistSplitDrafts(proposal);
    }
    return NextResponse.json({ ok: true, proposal });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
