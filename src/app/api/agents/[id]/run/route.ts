import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { createSseResponse } from "@/lib/ai-trace";
import { runAgent } from "@/lib/agent-runner";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  let stream = false;
  try {
    const body = await req.json().catch(() => ({}));
    stream = !!body.stream;
  } catch {
    /* empty */
  }

  const revalidate = () => {
    revalidatePath(`/agents/${id}`);
    revalidatePath("/agents");
    revalidatePath("/inbox");
    revalidatePath("/");
  };

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const output = await runAgent(id, "manual", emit);
        revalidate();
        emit({ event: "done", data: { output } });
      });
    }
    const output = await runAgent(id, "manual");
    revalidate();
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
