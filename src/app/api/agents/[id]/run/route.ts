import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { runAgent } from "@/lib/agent-runner";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  try {
    const output = await runAgent(id, "manual");
    revalidatePath(`/agents/${id}`);
    revalidatePath("/agents");
    revalidatePath("/inbox");
    revalidatePath("/");
    return NextResponse.json({ output });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
