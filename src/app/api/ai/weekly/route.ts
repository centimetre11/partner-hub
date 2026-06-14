import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { streamTextCompletion } from "@/lib/ai-stream-text";
import { stageName } from "@/lib/constants";
import { staleDays } from "@/lib/completeness";

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });
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
    db.todoItem.findMany({ where: { status: "OPEN", dueDate: { lt: new Date() } }, include: { partner: true }, take: 20 }),
  ]);

  const partnerLines = active
    .map((p) => {
      const opps = p.opportunities.filter((o) => o.status === "ACTIVE");
      return `${p.name}：阶段${p.pipelineStage}(${stageName(p.pipelineStage)})，${opps.length}个商机，${staleDays(p)}天无动态`;
    })
    .join("\n");
  const eventLines = recentEvents
    .map((e) => `${new Date(e.createdAt).toLocaleDateString("zh-CN")} ${e.partner.name}：${e.title}`)
    .join("\n");
  const overdueLines = overdue.map((t) => `${t.title}（${t.partner?.name ?? "-"}）`).join("\n");

  const content = await streamTextCompletion(
    [
      {
        role: "system",
        content:
          "你是帆软中东伙伴业务的经营分析师。基于数据生成本周经营周报（中文），结构：1）整体进展（2-3句）；2）风险信号（停滞伙伴、逾期待办，点名道姓）；3）本周建议聚焦的3个伙伴及理由；4）下周关键动作（3-5条）。简洁直接，不要套话。",
      },
      {
        role: "user",
        content: `候选池：${prospects} 家\n正式伙伴：${active.length} 家\n未完成待办：${openTodos} 项\n\n【正式伙伴状态】\n${partnerLines || "（无）"}\n\n【近7天动态】\n${eventLines || "（无）"}\n\n【逾期待办】\n${overdueLines || "（无）"}`,
      },
    ],
    { feature: "AI 经营周报", userId: uid, emit }
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
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

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
    const msg = e instanceof AIError ? e.message : "生成失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
