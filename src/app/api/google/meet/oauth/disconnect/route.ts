import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { disconnectUserMeet } from "@/lib/google-meet-oauth";

export async function POST() {
  const user = await requireUser();
  await disconnectUserMeet(user.id);
  return NextResponse.json({ ok: true });
}
