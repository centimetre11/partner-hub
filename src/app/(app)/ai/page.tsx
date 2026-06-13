import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, PageHeader, fmtDateTime } from "@/components/ui";

function fmtTokens(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export default async function AiCenterPage() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const [agents, templates, skills, knowledge, apiConfigs, todayUsage, recentRuns] = await Promise.all([
    db.agent.count({ where: { isTemplate: false } }),
    db.agent.count({ where: { isTemplate: true } }),
    db.skill.count(),
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
        title="AI 中心"
        desc="统一管理 Agent、Skill、知识库和大模型 API；用对话方式构建自动化 Agent"
        actions={
          <Link href="/agents/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            对话构建 Agent
          </Link>
        }
      />
      <div className="px-8 space-y-6 max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Agent", value: agents, href: "/agents", desc: `${templates} 个模板`, tone: "text-indigo-600" },
            { label: "Skill", value: skills, href: "/skills", desc: "工具 + 提示词", tone: "text-purple-600" },
            { label: "知识库", value: knowledge, href: "/knowledge", desc: "Agent 可检索", tone: "text-sky-600" },
            { label: "今日 Token", value: fmtTokens(todayTokens), href: "/settings", desc: "按 API 统计", tone: "text-emerald-600" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 hover:border-indigo-300 transition-colors">
              <div className={`text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</div>
              <div className="text-sm font-medium text-zinc-800 mt-1">{item.label}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{item.desc}</div>
            </Link>
          ))}
        </div>

        <Card title="AI 资产工作台">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/agents" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">❖</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">Agent 编排</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">管理自动化 Agent、模板、定时触发和运行历史。</p>
            </Link>
            <Link href="/skills" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">⚡</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">Skill 库</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">沉淀工具能力和提示词能力，供 Agent Builder 自动匹配。</p>
            </Link>
            <Link href="/knowledge" className="rounded-xl border border-zinc-100 p-4 hover:border-indigo-300 transition-colors">
              <div className="text-lg">📚</div>
              <div className="text-sm font-semibold text-zinc-900 mt-2">知识库</div>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">维护产品、策略、话术资料，让 Agent 运行时先检索再回答。</p>
            </Link>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="构建 Agent 的推荐流程">
            <div className="space-y-3 text-sm">
              {[
                ["1", "用自然语言描述目标", "说明想监控什么、输出给谁、什么时候触发。"],
                ["2", "回答调研问卷", "Builder 会一次性问清楚缺失信息，例如数据源、风险边界、写库规则。"],
                ["3", "确认 Skill 与草案", "自动匹配 Skill；没有合适 Skill 时写入临时解决策略。"],
                ["4", "创建后再微调", "保存为普通 Agent，可继续编辑、运行和共享。"],
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

          <Card title="大模型 API 状态" actions={<Link href="/settings" className="text-xs text-indigo-600 hover:underline">管理 →</Link>}>
            <div className="space-y-3">
              {apiConfigs.map((api) => (
                <div key={api.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 truncate">{api.name}</div>
                    <div className="text-xs text-zinc-400 truncate">{api.model}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {api.isDefault && <Badge tone="indigo">默认</Badge>}
                    <Badge tone={api.enabled ? "green" : "zinc"}>{api.enabled ? "启用" : "停用"}</Badge>
                  </div>
                </div>
              ))}
              {apiConfigs.length === 0 && (
                <div className="text-sm text-zinc-400">暂无数据库 API 配置，可在团队设置里添加。</div>
              )}
            </div>
          </Card>
        </div>

        <Card title="最近 Agent 运行">
          {recentRuns.length ? (
            <div className="space-y-2.5">
              {recentRuns.map((run) => (
                <Link key={run.id} href={`/agents/${run.agentId}`} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 truncate">{run.agent.icon} {run.agent.name}</div>
                    <div className="text-xs text-zinc-400">{fmtDateTime(run.startedAt)}</div>
                  </div>
                  <Badge tone={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>
                    {run.status === "SUCCESS" ? "成功" : run.status === "FAILED" ? "失败" : "运行中"}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-400 py-6 text-center">还没有 Agent 运行记录。{user.name} 可以先创建一个 Agent 试跑。</div>
          )}
        </Card>
      </div>
    </div>
  );
}
