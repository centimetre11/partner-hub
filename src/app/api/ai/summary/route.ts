import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { streamTextCompletion } from "@/lib/ai-stream-text";
import { EVENT_TYPE_LABELS } from "@/lib/constants";

async function generateSummary(partnerId: string, uid: string, emit?: Parameters<typeof streamTextCompletion>[1]["emit"]) {
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      opportunities: true,
      todos: { where: { status: "OPEN" } },
    },
  });
  if (!partner) throw new AIError("Partner not found");

  const timeline = partner.events
    .map((e) => `${new Date(e.createdAt).toLocaleDateString("en-US")} [${EVENT_TYPE_LABELS[e.type] ?? e.type}] ${e.title}${e.content ? `: ${e.content.slice(0, 300)}` : ""}`)
    .join("\n");
  const opps = partner.opportunities.map((o) => `${o.name} (${o.stage}, ${o.amount ?? "amount unknown"}, ${o.status})`).join("; ");

  const summary = await streamTextCompletion(
    [
      {
        role: "system",
        content:
          "You are an analyst for the Fanruan Middle East Partner Management System. Based on the partner's activity timeline, generate a concise summary (in English) with three parts: 1) What happened recently (2-4 sentences); 2) Risk signals (if any); 3) Recommended actions (1-3 specific, executable items). Output plain text — no markdown headings.",
      },
      {
        role: "user",
        content: `Partner: ${partner.name} (Pipeline stage ${partner.pipelineStage}/3)\nOpportunities: ${opps || "none"}\nOpen todos: ${partner.todos.length}\n\n[Activity timeline (newest first)]\n${timeline || "(no activity)"}`,
      },
    ],
    { feature: "Partner Activity Summary", userId: uid, emit }
  );

  await db.timelineEvent.create({
    data: {
      partnerId,
      type: "AI_SUMMARY",
      title: "AI Activity Summary",
      content: summary,
      createdById: uid,
    },
  });
  return { summary };
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { partnerId, stream } = await req.json();
  if (!partnerId) return NextResponse.json({ error: "Missing partnerId" }, { status: 400 });

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const result = await generateSummary(partnerId, uid, emit);
        emit({ event: "done", data: result });
      });
    }
    const result = await generateSummary(partnerId, uid);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "Generation failed — please try again later";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
