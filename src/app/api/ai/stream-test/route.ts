import { createSseResponse } from "@/lib/ai-trace";

// 临时流式诊断端点（无鉴权）。验证完会删除。
export const dynamic = "force-dynamic";

export async function GET() {
  return createSseResponse(async (emit) => {
    for (let i = 0; i < 10; i++) {
      await emit({ event: "reply_delta", delta: `chunk-${i} @${Date.now()}\n` });
      await new Promise((r) => setTimeout(r, 300));
    }
    emit({ event: "done", data: { ok: true } });
  });
}
