import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AutomationForm } from "@/components/automation-form";
import { AiCenterNav } from "@/components/ai-center-nav";
import { describeCron } from "@/lib/cron";
import { getServerI18n } from "@/lib/server-i18n";
import { parseAutomationQuery, DEFAULT_AUTOMATION_QUERY } from "@/lib/automation-query";
import { fmtDateTime } from "@/components/ui";

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { messages: m, bcp47, locale } = await getServerI18n();

  const [agent, partners] = await Promise.all([
    db.agent.findFirst({
      where: { id, isAutomation: true },
      include: {
        runs: { orderBy: { startedAt: "desc" }, take: 10 },
      },
    }),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!agent) notFound();

  const query =
    parseAutomationQuery(agent.queryConfig) ?? {
      ...DEFAULT_AUTOMATION_QUERY,
      scope: agent.partnerId ? ("partner" as const) : ("all" as const),
      partnerId: agent.partnerId ?? undefined,
    };

  const scheduleHint =
    agent.cronExpr
      ? `${m.automations.nextSchedule}: ${describeCron(agent.cronExpr, locale)}${
          agent.nextRunAt
            ? ` · ${m.automations.nextRunAt.replace("{time}", fmtDateTime(agent.nextRunAt, bcp47))}`
            : ""
        }`
      : undefined;

  return (
    <div className="pb-8">
      <AiCenterNav />
      <AutomationForm
        partners={partners}
        runs={agent.runs.map((run) => ({
          id: run.id,
          status: run.status,
          output: run.output,
          error: run.error,
          toolLog: run.toolLog,
          startedAtLabel: fmtDateTime(run.startedAt, bcp47),
        }))}
        scheduleHint={scheduleHint}
        initial={{
          id: agent.id,
          slug: agent.slug ?? "",
          name: agent.name,
          cronExpr: agent.cronExpr ?? "0 9 * * *",
          timezone: agent.timezone ?? "Asia/Shanghai",
          wecomPushChatId: agent.wecomPushChatId ?? "",
          pushEmailTo: agent.pushEmailTo ?? "",
          pushWecomAppTo: agent.pushWecomAppTo ?? "",
          notifyOnSuccess: agent.notifyOnSuccess,
          notifyOnFailure: agent.notifyOnFailure,
          enabled: agent.enabled,
          query,
        }}
      />
    </div>
  );
}
