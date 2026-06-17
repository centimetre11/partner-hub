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

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
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

  return (
    <div className="pb-16">
      <PageHeader
        title={`${agent.icon} ${agent.name}`}
        desc={`Created by ${agent.createdBy?.name ?? "System"} · ${agent.enabled ? "Enabled" : "Disabled"}${agent.nextRunAt ? ` · Next run ${fmtDateTime(agent.nextRunAt)}` : ""}`}
        actions={
          <>
            <form
              action={deleteAgentAction.bind(null, agent.id)}
            >
              <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50">Delete</button>
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
          <Card title={`Run History (last ${agent.runs.length})`}>
            {agent.runs.length ? (
              <div className="space-y-4">
                {agent.runs.map((r) => (
                  <details key={r.id} className="group border border-zinc-100 rounded-lg">
                    <summary className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer list-none">
                      <span className="flex items-center gap-2 text-sm">
                        <Badge tone={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "amber"}>
                          {r.status === "SUCCESS" ? "Success" : r.status === "FAILED" ? "Failed" : "Running"}
                        </Badge>
                        <span className="text-zinc-600">{fmtDateTime(r.startedAt)}</span>
                      </span>
                      <span className="text-xs text-zinc-400 group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="px-3.5 pb-3 border-t border-zinc-100 pt-2.5">
                      {r.error && <p className="text-xs text-red-500 mb-2">Error: {r.error}</p>}
                      {r.output && (
                        <pre className="text-xs text-zinc-700 whitespace-pre-wrap font-sans bg-zinc-50 rounded-lg p-3 max-h-72 overflow-auto">{r.output}</pre>
                      )}
                      {r.toolLog && JSON.parse(r.toolLog).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-zinc-500 cursor-pointer font-medium">
                            Tool call trace ({JSON.parse(r.toolLog).length} calls)
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
              <EmptyState text="No runs yet. Click Run Now in the top right to try it." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
