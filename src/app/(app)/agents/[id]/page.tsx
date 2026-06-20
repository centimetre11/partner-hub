import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { AiProcessTrace, toolLogToTrace } from "@/components/ai-process-trace";
import { AiCenterNav } from "@/components/ai-center-nav";
import { resolveAgentSkills } from "@/lib/skill-resolver";
import { deleteAgentAction } from "@/lib/agent-actions";
import { AgentForm } from "../agent-form";
import { RunButton } from "./run-button";
import { getServerI18n } from "@/lib/server-i18n";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const { id } = await params;
  const agent = await db.agent.findUnique({
    where: { id },
    include: {
      partner: true,
      createdBy: true,
      runs: { orderBy: { startedAt: "desc" }, take: 10 },
      skillLinks: true,
    },
  });
  if (!agent || agent.isTemplate) notFound();

  const { toolOptions, promptSkillOptions } = await resolveAgentSkills(agent.id, agent.skills);

  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const statusText = agent.enabled ? m.common.enabled : m.common.disabled;
  const nextRunText = agent.nextRunAt ? ` · ${m.agents.nextRun.replace("{time}", fmtDateTime(agent.nextRunAt, bcp47))}` : "";
  const desc = m.agents.statusLine
    .replace("{creator}", agent.createdBy?.name ?? m.agents.system)
    .replace("{status}", statusText)
    .replace("{nextRun}", nextRunText);

  return (
    <div className="pb-16">
      <PageHeader
        title={`${agent.icon} ${agent.name}`}
        desc={desc}
        actions={
          <>
            <form action={deleteAgentAction.bind(null, agent.id)}>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50">{m.agents.deleteBtn}</button>
            </form>
            <RunButton agentId={agent.id} />
          </>
        }
      />
      <AiCenterNav />
      <div className="px-8 grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <AgentForm
            agent={{
              id: agent.id,
              name: agent.name,
              icon: agent.icon,
              description: agent.description ?? "",
              instructions: agent.instructions,
              skills: JSON.parse(agent.skills || "[]"),
              skillIds: agent.skillLinks.map((l) => l.skillId),
              trigger: agent.trigger,
              frequency: agent.frequency ?? "WEEKLY",
              runHour: agent.runHour,
              runWeekday: agent.runWeekday,
              scopeType: agent.scopeType,
              partnerId: agent.partnerId ?? "",
              shared: agent.shared,
              webhookUrl: agent.webhookUrl ?? "",
            }}
            toolOptions={toolOptions}
            promptSkillOptions={promptSkillOptions}
            partners={partners}
          />
        </div>

        <div className="xl:col-span-2 space-y-4">
          <Card title={m.agents.runHistory.replace("{n}", String(agent.runs.length))}>
            {agent.runs.length ? (
              <div className="space-y-4">
                {agent.runs.map((r) => (
                  <details key={r.id} className="group border border-slate-100 rounded-lg">
                    <summary className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer list-none">
                      <span className="flex items-center gap-2 text-sm">
                        <Badge tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "amber"}>
                          {r.status === "SUCCESS" ? m.common.success : r.status === "FAILED" ? m.common.failed : m.common.running}
                        </Badge>
                        <span className="text-slate-600">{fmtDateTime(r.startedAt, bcp47)}</span>
                      </span>
                      <span className="text-xs text-slate-400 group-open:rotate-180">▾</span>
                    </summary>
                    <div className="px-3.5 pb-3 border-t border-slate-100 pt-2.5">
                      {r.error && <p className="text-xs text-red-500 mb-2">{m.agents.error} {r.error}</p>}
                      {r.output && (
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-3 max-h-72 overflow-auto">{r.output}</pre>
                      )}
                      {r.toolLog && JSON.parse(r.toolLog).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-slate-500 cursor-pointer font-medium">
                            {m.agents.toolTrace.replace("{n}", String(JSON.parse(r.toolLog).length))}
                          </summary>
                          <div className="mt-2">
                            <AiProcessTrace
                              steps={toolLogToTrace(
                                JSON.parse(r.toolLog) as { tool: string; args: unknown; result: string }[]
                              )}
                            />
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <EmptyState text={m.agents.noRunsDetail} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
