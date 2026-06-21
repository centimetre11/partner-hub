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

  const flowSteps = [
    [m.ai.flow1Title, m.ai.flow1Desc],
    [m.ai.flow2Title, m.ai.flow2Desc],
    [m.ai.flow3Title, m.ai.flow3Desc],
    [m.ai.flow4Title, m.ai.flow4Desc],
  ] as const;

  return (
    <div className="pb-16">
      <PageHeader
        title={m.ai.title}
        desc={m.ai.desc}
        actions={
          <Link href="/agents/new" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
            {m.ai.buildAgent}
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8 space-y-6 max-w-7xl">
        <Link
          href="/tools"
          className="block rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-white p-5 hover:border-sky-200 hover:shadow-sm transition-shadow"
        >
          <div className="flex flex-col lg:flex-row lg:items-start gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-sky-100 text-xl shadow-sm">
                  🔧
                </span>
                <div>
                  <div className="text-xs font-medium text-sky-700/80 uppercase tracking-wide">{m.ai.capabilityLayers}</div>
                  <div className="text-lg font-semibold text-slate-900">{m.ai.tools}</div>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed max-w-2xl">{m.ai.toolsLayerDesc}</p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700">
                {m.ai.toolsLayerBrowse}
                <span aria-hidden>→</span>
              </div>
            </div>
            <div className="lg:w-[420px] shrink-0 rounded-lg border border-slate-100 bg-white/80 p-4">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-3">
                {m.ai.toolsLayerCategories}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {toolCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {cat.tools.length} {locale === "zh" ? "项" : "tools"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Link>

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

        <Card title={m.ai.recommendedFlow}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {flowSteps.map(([title, desc], i) => (
              <div
                key={title}
                className="relative rounded-lg border border-slate-100 bg-slate-50/40 p-4 h-full"
              >
                {i < flowSteps.length - 1 && (
                  <span className="hidden xl:block absolute top-1/2 -right-2.5 -translate-y-1/2 text-slate-300 text-sm z-10">
                    →
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div className="font-medium text-slate-800">{title}</div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pl-9">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
            <Link
              href="/agents/new"
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              {m.ai.buildAgent}
            </Link>
          </div>
        </Card>

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
