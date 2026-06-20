import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AutomationForm } from "@/components/automation-form";
import { Badge, fmtDateTime } from "@/components/ui";
import { deleteAutomationAction, toggleAutomationAction } from "@/lib/automation-actions";
import type { AutomationVariable } from "@/lib/automation-builder-types";
import { describeCron } from "@/lib/cron";
import { getServerI18n } from "@/lib/server-i18n";
import { RunButton } from "@/app/(app)/agents/[id]/run-button";

function extractTaskMd(instructions: string): string {
  const marker = "\n---\n【自动化执行说明】";
  const idx = instructions.indexOf(marker);
  if (idx >= 0) return instructions.slice(0, idx).trim();
  return instructions;
}

export default async function AutomationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { messages: m, bcp47, locale } = await getServerI18n();

  const agent = await db.agent.findFirst({
    where: { id, isAutomation: true },
    include: {
      createdBy: true,
      runs: { orderBy: { startedAt: "desc" }, take: 10 },
    },
  });
  if (!agent) notFound();

  let variables: AutomationVariable[] = [];
  try {
    variables = JSON.parse(agent.variables || "[]");
  } catch {
    variables = [];
  }

  const triggerType =
    agent.trigger === "SCHEDULE" ? "SCHEDULE" : agent.webhookUrl ? "WEBHOOK" : "EVENT";

  return (
    <div className="pb-16">
      <AutomationForm
        initial={{
          id: agent.id,
          slug: agent.slug ?? "",
          name: agent.name,
          description: agent.description ?? "",
          taskMd: extractTaskMd(agent.instructions),
          triggerType: triggerType as "SCHEDULE" | "WEBHOOK" | "EVENT",
          cronExpr: agent.cronExpr ?? "0 9 * * *",
          timezone: agent.timezone ?? "Asia/Shanghai",
          validityDays: agent.validityDays,
          variables,
          maxIterations: agent.maxIterations,
          timeoutMinutes: agent.timeoutMinutes,
          notifyOnSuccess: agent.notifyOnSuccess,
          notifyOnFailure: agent.notifyOnFailure,
          wecomPushChatId: agent.wecomPushChatId ?? "",
          webhookUrl: agent.webhookUrl ?? "",
          enabled: agent.enabled,
        }}
      />

      <div className="px-8 max-w-7xl mt-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-800">{m.automations.runHistory}</h2>
          <div className="flex items-center gap-2">
            <RunButton agentId={agent.id} compact />
            <form action={toggleAutomationAction.bind(null, agent.id)}>
              <button type="submit" className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5">
                {agent.enabled ? m.automations.disable : m.automations.enable}
              </button>
            </form>
            <form action={deleteAutomationAction.bind(null, agent.id)}>
              <button type="submit" className="text-xs text-red-500 hover:text-red-700 border border-red-100 rounded-lg px-3 py-1.5">
                {m.automations.delete}
              </button>
            </form>
          </div>
        </div>

        {agent.runs.length === 0 ? (
          <p className="text-sm text-slate-400">{m.automations.noRuns}</p>
        ) : (
          <div className="space-y-3">
            {agent.runs.map((run) => (
              <div key={run.id} className="bg-white rounded-lg border border-slate-200/80 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs text-slate-400">{fmtDateTime(run.startedAt, bcp47)}</span>
                  <Badge tone={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>
                    {run.status === "SUCCESS" ? m.common.success : run.status === "FAILED" ? m.common.failed : m.common.running}
                  </Badge>
                </div>
                {run.output && (
                  <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans line-clamp-6">{run.output}</pre>
                )}
                {run.error && <p className="text-sm text-red-600 mt-1">{run.error}</p>}
              </div>
            ))}
          </div>
        )}

        {agent.cronExpr && (
          <p className="text-xs text-slate-400">
            {m.automations.nextSchedule}: {describeCron(agent.cronExpr, locale)}
            {agent.nextRunAt && ` · ${m.automations.nextRunAt.replace("{time}", fmtDateTime(agent.nextRunAt, bcp47))}`}
          </p>
        )}
      </div>
    </div>
  );
}
