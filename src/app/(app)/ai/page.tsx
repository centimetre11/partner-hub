import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, PageHeader, fmtDateTime } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_COUNT, getBuiltinToolCategories } from "@/lib/tools-registry";
import { getServerI18n } from "@/lib/server-i18n";

export default async function AiCenterPage() {
  const user = await requireUser();
  const { locale, messages: m, bcp47 } = await getServerI18n();
  const toolCategories = getBuiltinToolCategories(locale);
  const [agents, templates, promptSkills, knowledge, recentRuns] = await Promise.all([
    db.agent.count({ where: { isTemplate: false, isAutomation: false } }),
    db.agent.count({ where: { isTemplate: true } }),
    db.skill.count({ where: { kind: "PROMPT", isBuiltin: false } }),
    db.knowledgeArticle.count(),
    db.agentRun.findMany({
      where: { agent: { isAutomation: false } },
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { agent: true },
    }),
  ]);

  return (
    <div className="pb-16">
      <PageHeader title={m.ai.title} desc={m.ai.desc} />
      <AiCenterNav />
      <div className="px-8 space-y-6 max-w-7xl">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/agents" className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300">
            <div className="text-2xl font-bold tabular-nums text-sky-600">{agents}</div>
            <div className="text-sm font-medium text-slate-800 mt-1">{m.ai.statsAgents}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {templates} {m.ai.templates}
            </div>
          </Link>

          <Link
            href="/tools"
            className="bg-white rounded-lg border border-sky-100 shadow-sm p-5 hover:border-sky-200 lg:row-span-1"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-bold tabular-nums text-sky-600">{BUILTIN_TOOL_COUNT}</div>
                <div className="text-sm font-medium text-slate-800 mt-1">{m.ai.statsTools}</div>
                <div className="text-xs text-slate-400 mt-0.5">{m.ai.builtinCapabilities}</div>
              </div>
              <span className="text-2xl">🔧</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {toolCategories.slice(0, 4).map((cat) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800"
                >
                  {cat.icon} {cat.label}
                </span>
              ))}
            </div>
          </Link>

          <Link href="/skills" className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300">
            <div className="text-2xl font-bold tabular-nums text-purple-600">{promptSkills}</div>
            <div className="text-sm font-medium text-slate-800 mt-1">{m.ai.statsSkills}</div>
            <div className="text-xs text-slate-400 mt-0.5">{m.ai.methodologyFlows}</div>
          </Link>

          <Link href="/knowledge" className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300">
            <div className="text-2xl font-bold tabular-nums text-emerald-600">{knowledge}</div>
            <div className="text-sm font-medium text-slate-800 mt-1">{m.ai.statsKnowledge}</div>
            <div className="text-xs text-slate-400 mt-0.5">{m.ai.agentSearchable}</div>
          </Link>
        </div>

        <Card title={m.ai.recentRuns}>
          {recentRuns.length ? (
            <div className="space-y-2.5">
              {recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/agents/${run.agentId}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3 hover:border-slate-300"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {run.agent.icon} {run.agent.name}
                    </div>
                    <div className="text-xs text-slate-400">{fmtDateTime(run.startedAt, bcp47)}</div>
                  </div>
                  <Badge tone={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>
                    {run.status === "SUCCESS" ? m.common.success : run.status === "FAILED" ? m.common.failed : m.common.running}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400 py-6 text-center">{m.ai.noRunsUser.replace("{name}", user.name)}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
