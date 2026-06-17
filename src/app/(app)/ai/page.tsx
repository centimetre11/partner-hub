import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, PageHeader, fmtDateTime } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_COUNT } from "@/lib/tools-registry";

function fmtTokens(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function AiCenterPage() {
  const user = await requireUser();
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

  return (
    <div className="pb-16">
      <PageHeader
        title="AI Center"
        desc="Orchestrate automation with Agents, equip tools and skills, connect knowledge base and LLM APIs"
        actions={
          <Link href="/agents/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            Build Agent via Chat
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8 space-y-6 max-w-7xl">
        <div className="rounded-xl border border-zinc-200/80 bg-gradient-to-br from-zinc-50 to-indigo-50/30 p-5">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Capability Layers</div>
          <div className="flex flex-col md:flex-row items-stretch gap-3 text-sm">
            <div className="flex-1 rounded-lg bg-white border border-zinc-200/80 p-4">
              <div className="text-lg mb-1">❖</div>
              <div className="font-semibold text-zinc-900">Agent</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Decision maker: understands tasks, orchestrates workflows, calls tools, delivers results</p>
            </div>
            <div className="hidden md:flex items-center text-zinc-300 text-xl px-1">→</div>
            <div className="flex-1 rounded-lg bg-white border border-purple-100 p-4">
              <div className="text-lg mb-1">⚡</div>
              <div className="font-semibold text-zinc-900">Skills</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Methodology: tells the Agent how to work—research frameworks, report structures, SOPs</p>
            </div>
            <div className="hidden md:flex items-center text-zinc-300 text-xl px-1">→</div>
            <div className="flex-1 rounded-lg bg-white border border-indigo-100 p-4">
              <div className="text-lg mb-1">🔧</div>
              <div className="font-semibold text-zinc-900">Tools</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Capability units: directly invoked by the Agent—read profiles, search the web, create todos</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Agent", value: agents, href: "/agents", desc: `${templates} templates`, tone: "text-indigo-600" },
            { label: "Tools", value: BUILTIN_TOOL_COUNT, href: "/tools", desc: "Built-in capabilities", tone: "text-sky-600" },
            { label: "Skills", value: promptSkills, href: "/skills", desc: "Methodology flows", tone: "text-purple-600" },
            { label: "Knowledge", value: knowledge, href: "/knowledge", desc: "Agent searchable", tone: "text-emerald-600" },
            { label: "Today's Tokens", value: fmtTokens(todayTokens), href: "/settings", desc: "By API", tone: "text-amber-600" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 hover:border-indigo-300 transition-colors">
              <div className={`text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</div>
              <div className="text-sm font-medium text-zinc-800 mt-1">{item.label}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{item.desc}</div>
            </Link>
          ))}
        </div>

        <Card title="Workbench">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Link href="/agents" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">❖</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">Agent Orchestration</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Create automation Agents, configure triggers, equip tools and skills.</p>
            </Link>
            <Link href="/tools" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">🔧</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">Tool Kit</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Browse capability units Agents can call: profiles, todos, web search, knowledge retrieval.</p>
            </Link>
            <Link href="/skills" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">⚡</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">Skill Library</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Capture team methodology for Agents to follow professional workflows.</p>
            </Link>
            <Link href="/knowledge" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">📚</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">Knowledge Base</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Maintain product, strategy, and playbook content—Agents search first, then answer.</p>
            </Link>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Recommended Agent Creation Flow">
            <div className="space-y-3 text-sm">
              {[
                ["1", "Describe the goal", "Explain what to monitor, who receives output, and when it should trigger."],
                ["2", "Answer the survey", "Builder asks about data sources, risk boundaries, and write rules in one pass."],
                ["3", "Equip tools + skills", "Tools define what it can do; skills define how. Write ad-hoc strategy when no skill fits."],
                ["4", "Fine-tune after creation", "Saved as a regular Agent—continue editing, running, and sharing."],
              ].map(([n, title, desc]) => (
                <div key={n} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold flex items-center justify-center shrink-0">{n}</div>
                  <div>
                    <div className="font-medium text-zinc-800">{title}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="LLM API Status" actions={<Link href="/settings" className="text-xs text-indigo-600 hover:underline">Manage →</Link>}>
            <div className="space-y-3">
              {apiConfigs.map((api) => (
                <div key={api.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 truncate">{api.name}</div>
                    <div className="text-xs text-zinc-400 truncate">{api.model}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {api.isDefault && <Badge tone="indigo">Default</Badge>}
                    <Badge tone={api.enabled ? "green" : "zinc"}>{api.enabled ? "Enabled" : "Disabled"}</Badge>
                  </div>
                </div>
              ))}
              {apiConfigs.length === 0 && (
                <div className="text-sm text-zinc-400">No database API configs yet. Add them in Team Settings.</div>
              )}
            </div>
          </Card>
        </div>

        <Card title="Recent Agent Runs">
          {recentRuns.length ? (
            <div className="space-y-2.5">
              {recentRuns.map((run) => (
                <Link key={run.id} href={`/agents/${run.agentId}`} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 truncate">{run.agent.icon} {run.agent.name}</div>
                    <div className="text-xs text-zinc-400">{fmtDateTime(run.startedAt)}</div>
                  </div>
                  <Badge tone={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>
                    {run.status === "SUCCESS" ? "Success" : run.status === "FAILED" ? "Failed" : "Running"}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-400 py-6 text-center">No Agent runs yet. {user.name} can create an Agent and try a test run.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
