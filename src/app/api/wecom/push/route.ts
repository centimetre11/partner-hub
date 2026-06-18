import { NextRequest, NextResponse } from "next/server";
import { enqueueWecomPush, enqueueWecomPushForPartner } from "@/lib/wecom-push";
import { requireUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  await requireUser();
  const body = (await req.json()) as {
    chatId?: string;
    partnerId?: string;
    content?: string;
  };
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "缺少推送内容" }, { status: 400 });

  try {
    const job = body.partnerId
      ? await enqueueWecomPushForPartner(body.partnerId, content)
      : body.chatId
        ? await enqueueWecomPush(body.chatId.trim(), content)
        : null;
    if (!job) return NextResponse.json({ error: "请提供 partnerId 或 chatId" }, { status: 400 });
    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
