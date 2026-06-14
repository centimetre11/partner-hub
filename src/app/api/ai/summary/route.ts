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
  if (!partner) throw new AIError("伙伴不存在");

  const timeline = partner.events
    .map((e) => `${new Date(e.createdAt).toLocaleDateString("zh-CN")} [${EVENT_TYPE_LABELS[e.type] ?? e.type}] ${e.title}${e.content ? `：${e.content.slice(0, 300)}` : ""}`)
    .join("\n");
  const opps = partner.opportunities.map((o) => `${o.name}（${o.stage}，${o.amount ?? "金额未知"}，${o.status}）`).join("；");

  const summary = await streamTextCompletion(
    [
      {
        role: "system",
        content:
          "你是帆软中东伙伴管理系统的分析师。基于伙伴的动态时间线生成简明摘要（中文），包含三部分：1）近期发生了什么（2-4句）；2）风险信号（如有）；3）建议动作（1-3条，具体可执行）。直接输出文本，不要用 markdown 标题。",
      },
      {
        role: "user",
        content: `伙伴：${partner.name}（Pipeline 阶段 ${partner.pipelineStage}/10）\n商机：${opps || "无"}\n未完成待办：${partner.todos.length} 项\n\n【动态时间线（新→旧）】\n${timeline || "（无动态）"}`,
      },
    ],
    { feature: "伙伴动态摘要", userId: uid, emit }
  );

  await db.timelineEvent.create({
    data: {
      partnerId,
      type: "AI_SUMMARY",
      title: "AI 动态摘要",
      content: summary,
      createdById: uid,
    },
  });
  return { summary };
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { partnerId, stream } = await req.json();
  if (!partnerId) return NextResponse.json({ error: "缺少 partnerId" }, { status: 400 });

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
    const msg = e instanceof AIError ? e.message : "生成失败，请稍后重试";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
