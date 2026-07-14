import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { runMeetingAsrPipeline } from "@/lib/asr/pipeline";
import { getAsrConfig } from "@/lib/asr/config";

export const runtime = "nodejs";
export const maxDuration = 600;

/** 整段精修转写（Route Handler，避免 Server Action 哈希问题） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!getAsrConfig().enabled) {
    return NextResponse.json(
      { error: "未配置 ASR_BASE_URL。请确认 whisper-asr 服务已启动。" },
      { status: 400 },
    );
  }

  const { id: meetingId } = await ctx.params;
  try {
    const result = await runMeetingAsrPipeline(meetingId, uid);
    return NextResponse.json({
      ok: true,
      message: `转写完成（${result.chars} 字 / ${result.sentences} 段），可用 AI 拆分`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 500 });
  }
}
