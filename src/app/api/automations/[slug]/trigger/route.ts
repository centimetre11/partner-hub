import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAgent } from "@/lib/agent-runner";

/** Webhook 触发自动化：POST /api/automations/{slug}/trigger */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await db.agent.findFirst({
    where: { slug, isAutomation: true, enabled: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Automation not found or disabled" }, { status: 404 });
  }

  try {
    const output = await runAgent(agent.id, "manual");
    return NextResponse.json({ ok: true, agentId: agent.id, output: output.slice(0, 2000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
