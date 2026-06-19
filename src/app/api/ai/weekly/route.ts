import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { streamTextCompletion } from "@/lib/ai-stream-text";
import { stageName } from "@/lib/constants";
import { staleDays } from "@/lib/completeness";
import { overdueDueDateBefore } from "@/lib/todo-dates";

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const setting = await db.setting.findUnique({ where: { key: "weekly_report" } });
  return NextResponse.json(setting ? JSON.parse(setting.value) : null);
}

async function generateWeekly(uid: string, emit?: Parameters<typeof streamTextCompletion>[1]["emit"]) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [active, prospects, recentEvents, openTodos, overdue] = await Promise.all([
    db.partner.findMany({ where: { status: "ACTIVE" }, include: { events: true, opportunities: true } }),
    db.partner.count({ where: { status: "PROSPECT" } }),
    db.timelineEvent.findMany({
      where: { createdAt: { gte: since } },
      include: { partner: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    db.todoItem.count({ where: { status: "OPEN" } }),
    db.todoItem.findMany({ where: { status: "OPEN", dueDate: { lt: overdueDueDateBefore() } }, include: { partner: true }, take: 20 }),
  ]);

  const partnerLines = active
    .map((p) => {
      const opps = p.opportunities.filter((o) => o.status === "ACTIVE");
      return `${p.name}: stage ${p.pipelineStage} (${stageName(p.pipelineStage)}), ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"}, ${staleDays(p)} days without activity`;
    })
    .join("\n");
  const eventLines = recentEvents
    .map((e) => `${new Date(e.createdAt).toLocaleDateString("en-US")} ${e.partner.name}: ${e.title}`)
    .join("\n");
  const overdueLines = overdue.map((t) => `${t.title} (${t.partner?.name ?? "-"})`).join("\n");

  const content = await streamTextCompletion(
    [
      {
        role: "system",
        content:
          "You are a business analyst for Fanruan Middle East partner operations. Based on the data, generate this week's business report (in English). Structure: 1) Overall progress (2-3 sentences); 2) Risk signals (stalled partners, overdue todos — name names); 3) Three partners to focus on this week and why; 4) Key actions for next week (3-5 items). Be concise and direct — no filler.",
      },
      {
        role: "user",
        content: `Prospect pool: ${prospects}\nActive partners: ${active.length}\nOpen todos: ${openTodos}\n\n[Active partner status]\n${partnerLines || "(none)"}\n\n[Last 7 days activity]\n${eventLines || "(none)"}\n\n[Overdue todos]\n${overdueLines || "(none)"}`,
      },
    ],
    { feature: "AI Weekly Report", userId: uid, emit }
  );

  const report = { content, generatedAt: new Date().toISOString() };
  await db.setting.upsert({
    where: { key: "weekly_report" },
    create: { key: "weekly_report", value: JSON.stringify(report) },
    update: { value: JSON.stringify(report) },
  });
  return report;
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let stream = false;
  try {
    const body = await req.json().catch(() => ({}));
    stream = !!body.stream;
  } catch {
    /* empty body ok */
  }

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const result = await generateWeekly(uid, emit);
        emit({ event: "done", data: result });
      });
    }
    const result = await generateWeekly(uid);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "Generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
