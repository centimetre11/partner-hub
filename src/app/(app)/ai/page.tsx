import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, PageHeader, fmtDateTime } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_COUNT } from "@/lib/tools-registry";
import { isSuperAdmin } from "@/lib/user-roles";
import { getServerI18n } from "@/lib/server-i18n";

function fmtTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
}

export default async function AiCenterPage() {
  const user = await requireUser();
  const { locale, messages: m, bcp47 } = await getServerI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [agents, templates, promptSkills, knowledge, apiConfigs, todayUsage, recentRuns] = await Promise.all([
    db.agent.count({ where: { isTemplate: false } }),
    db.agent.count({ where: { isTemplate: true } }),
    db.skill.count({ where: { kind: "PROMPT", isBuiltin: false } }),
    db.knowledgeArticle.count(),
    db.aiApiConfig.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 4 }),
    db.aiDailyTokenUsage.findMany({ where: { day: today }, orderBy: { totalTokens: "desc" } }),
    db.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { agent: true },
    }),
  ]);
  const todayTokens = todayUsage.reduce((sum, row) => sum + row.totalTokens, 0);
  const admin = isSuperAdmin(user);
  const settingsHref = admin ? "/settings" : "/ai";

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
        <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">{m.ai.capabilityLayers}</div>
          <div className="flex flex-col md:flex-row items-stretch gap-3 text-sm">
            <div className="flex-1 rounded-lg bg-white border border-slate-200/80 p-4">
              <div className="text-lg mb-1">❖</div>
              <div className="font-semibold text-slate-900">{m.ai.agent}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.agentLayerDesc}</p>
            </div>
            <div className="hidden md:flex items-center text-slate-300 text-xl px-1">→</div>
            <div className="flex-1 rounded-lg bg-white border border-purple-100 p-4">
              <div className="text-lg mb-1">⚡</div>
              <div className="font-semibold text-slate-900">{m.ai.skills}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.skillsLayerDesc}</p>
            </div>
            <div className="hidden md:flex items-center text-slate-300 text-xl px-1">→</div>
            <div className="flex-1 rounded-lg bg-white border border-slate-200 p-4">
              <div className="text-lg mb-1">🔧</div>
              <div className="font-semibold text-slate-900">{m.ai.tools}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.toolsLayerDesc}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: m.ai.statsAgents, value: agents, href: "/agents", desc: `${templates} ${m.ai.templates}`, tone: "text-sky-600" },
            { label: m.ai.statsTools, value: BUILTIN_TOOL_COUNT, href: "/tools", desc: m.ai.builtinCapabilities, tone: "text-sky-600" },
            { label: m.ai.statsSkills, value: promptSkills, href: "/skills", desc: m.ai.methodologyFlows, tone: "text-purple-600" },
            { label: m.ai.statsKnowledge, value: knowledge, href: "/knowledge", desc: m.ai.agentSearchable, tone: "text-emerald-600" },
            { label: m.ai.statsTokens, value: fmtTokens(todayTokens, locale), href: settingsHref, desc: admin ? m.ai.byApi : m.ai.superAdminOnly, tone: "text-amber-600" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300">
              <div className={`text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</div>
              <div className="text-sm font-medium text-slate-800 mt-1">{item.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
            </Link>
          ))}
        </div>

        <Card title={m.ai.workbench}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <Link href="/agents" className="rounded-lg border border-slate-100 p-4 hover:border-slate-300">
              <div className="text-lg">❖</div>
              <div className="text-sm font-semibold text-slate-900 mt-2">{m.ai.agentOrchestration}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.workbenchAgentDesc}</p>
            </Link>
            <Link href="/tools" className="rounded-lg border border-slate-100 p-4 hover:border-slate-300">
              <div className="text-lg">🔧</div>
              <div className="text-sm font-semibold text-slate-900 mt-2">{m.ai.toolKit}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.workbenchToolsDesc}</p>
            </Link>
            <Link href="/skills" className="rounded-lg border border-slate-100 p-4 hover:border-slate-300">
              <div className="text-lg">⚡</div>
              <div className="text-sm font-semibold text-slate-900 mt-2">{m.ai.skillLibrary}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.workbenchSkillsDesc}</p>
            </Link>
            <Link href="/knowledge" className="rounded-lg border border-slate-100 p-4 hover:border-slate-300">
              <div className="text-lg">📚</div>
              <div className="text-sm font-semibold text-slate-900 mt-2">{m.ai.knowledgeBase}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.workbenchKnowledgeDesc}</p>
            </Link>
            <Link href="/knowhow" className="rounded-lg border border-slate-100 p-4 hover:border-slate-300">
              <div className="text-lg">🔍</div>
              <div className="text-sm font-semibold text-slate-900 mt-2">{m.ai.knowhowSearch}</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ai.workbenchKnowhowDesc}</p>
            </Link>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={m.ai.recommendedFlow}>
            <div className="space-y-3 text-sm">
              {flowSteps.map(([title, desc], i) => (
                <div key={title} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-50 text-sky-700 text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</div>
                  <div>
                    <div className="font-medium text-slate-800">{title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title={m.ai.llmStatus}
            actions={
              admin ? (
                <Link href="/settings" className="text-xs text-sky-600 hover:underline">{m.ai.manage}</Link>
              ) : (
                <span className="text-xs text-slate-400">{m.ai.superAdminOnly}</span>
              )
            }
          >
            <div className="space-y-3">
              {apiConfigs.map((api) => (
                <div key={api.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{api.name}</div>
                    <div className="text-xs text-slate-400 truncate">{api.model}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {api.isDefault && <Badge tone="indigo">{m.common.default}</Badge>}
                    <Badge tone={api.enabled ? "green" : "zinc"}>{api.enabled ? m.common.enabled : m.common.disabled}</Badge>
                  </div>
                </div>
              ))}
              {apiConfigs.length === 0 && (
                <div className="text-sm text-slate-400">{m.ai.noApiConfigs}</div>
              )}
            </div>
          </Card>
        </div>

        <Card title={m.ai.recentRuns}>
          {recentRuns.length ? (
            <div className="space-y-2.5">
              {recentRuns.map((run) => (
                <Link key={run.id} href={`/agents/${run.agentId}`} className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3 hover:border-slate-300">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{run.agent.icon} {run.agent.name}</div>
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
