import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { AIError } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { streamTextCompletion } from "@/lib/ai-stream-text";
import { staleDays } from "@/lib/completeness";
import { overdueDueDateBefore } from "@/lib/todo-dates";
import {
  buildWeeklyReportSystemPrompt,
  buildWeeklyReportUserContent,
  weeklyPartnerStatusLine,
} from "@/lib/ai-locale";
import { getLabels, localeToBcp47, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/locale-server";

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const locale = await getLocale();
  const setting = await db.setting.findUnique({ where: { key: "weekly_report" } });
  if (!setting) return NextResponse.json(null);
  const report = JSON.parse(setting.value) as { content?: string; generatedAt?: string; locale?: Locale };
  if (!report.locale || report.locale !== locale) return NextResponse.json(null);
  return NextResponse.json(report);
}

async function generateWeekly(uid: string, locale: Locale, emit?: Parameters<typeof streamTextCompletion>[1]["emit"]) {
  const labels = getLabels(locale);
  const bcp47 = localeToBcp47(locale);
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
      return weeklyPartnerStatusLine(locale, labels, {
        name: p.name,
        stage: p.pipelineStage,
        oppCount: opps.length,
        staleDays: staleDays(p),
      });
    })
    .join("\n");
  const eventLines = recentEvents
    .map((e) => `${new Date(e.createdAt).toLocaleDateString(bcp47)} ${e.partner?.name ?? "-"}: ${e.title}`)
    .join("\n");
  const overdueLines = overdue.map((t) => `${t.title} (${t.partner?.name ?? "-"})`).join("\n");

  const content = await streamTextCompletion(
    [
      {
        role: "system",
        content: buildWeeklyReportSystemPrompt(locale),
      },
      {
        role: "user",
        content: buildWeeklyReportUserContent({
          locale,
          prospects,
          activeCount: active.length,
          openTodos,
          partnerLines,
          eventLines,
          overdueLines,
        }),
      },
    ],
    { feature: locale === "zh" ? "AI 周报" : "AI Weekly Report", userId: uid, emit }
  );

  const report = { content, generatedAt: new Date().toISOString(), locale };
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
    const locale = await getLocale();
    if (stream) {
      return createSseResponse(async (emit) => {
        const result = await generateWeekly(uid, locale, emit);
        emit({ event: "done", data: result });
      });
    }
    const result = await generateWeekly(uid, locale);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : "Generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
