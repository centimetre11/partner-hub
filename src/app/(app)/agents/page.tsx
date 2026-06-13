import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { cloneAgentAction, toggleAgentAction } from "@/lib/agent-actions";
import { SKILL_MAP } from "@/lib/skills";

const FREQ_LABELS: Record<string, string> = { HOURLY: "每小时", DAILY: "每天", WEEKLY: "每周" };
const WEEKDAYS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default async function AgentsPage() {
  const user = await requireUser();
  const [agents, templates] = await Promise.all([
    db.agent.findMany({
      where: { isTemplate: false },
      include: { partner: true, createdBy: true, runs: { orderBy: { startedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    db.agent.findMany({ where: { isTemplate: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const mine = agents.filter((a) => a.createdById === user.id);
  const shared = agents.filter((a) => a.createdById !== user.id && a.shared);

  function AgentCard({ a }: { a: (typeof agents)[number] }) {
    const skills: string[] = JSON.parse(a.skills || "[]");
    const lastRun = a.runs[0];
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-5 ${a.enabled ? "border-zinc-200/80" : "border-zinc-200/80 opacity-60"}`}>
        <div className="flex items-start justify-between gap-2">
          <Link href={`/agents/${a.id}`} className="flex items-center gap-2.5 min-w-0 group">
            <span className="text-2xl">{a.icon}</span>
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 group-hover:text-indigo-600 truncate">{a.name}</div>
              <div className="text-xs text-zinc-400 truncate">{a.description ?? "—"}</div>
            </div>
          </Link>
          <form action={toggleAgentAction.bind(null, a.id)}>
            <button
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${a.enabled ? "bg-indigo-600" : "bg-zinc-200"}`}
              title={a.enabled ? "已启用，点击停用" : "已停用，点击启用"}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${a.enabled ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </form>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <Badge tone={a.trigger === "SCHEDULE" ? "purple" : "zinc"}>
            {a.trigger === "SCHEDULE"
              ? `${FREQ_LABELS[a.frequency ?? "DAILY"]}${a.frequency === "WEEKLY" ? WEEKDAYS[a.runWeekday] : ""}${a.frequency !== "HOURLY" ? ` ${a.runHour}:00` : ""}`
              : "手动触发"}
          </Badge>
          {a.partner && <Badge tone="blue">绑定 {a.partner.name}</Badge>}
          {a.webhookUrl && <Badge tone="green">Webhook</Badge>}
          {skills.slice(0, 3).map((s) => (
            <Badge key={s} tone="zinc">{SKILL_MAP.get(s)?.label ?? s}</Badge>
          ))}
          {skills.length > 3 && <span className="text-xs text-zinc-400">+{skills.length - 3}</span>}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
          <span>
            {a.createdBy?.name ?? "系统"} · 上次运行 {lastRun ? fmtDateTime(lastRun.startedAt) : "从未"}
            {lastRun?.status === "FAILED" && <span className="text-red-500 ml-1">失败</span>}
          </span>
          <span className="flex gap-2">
            <form action={cloneAgentAction.bind(null, a.id)}>
              <button className="text-zinc-400 hover:text-indigo-600">克隆</button>
            </form>
            <Link href={`/agents/${a.id}`} className="text-indigo-600 hover:underline">
              详情 →
            </Link>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Agent 中心"
        desc="AI 中心的一部分：用对话或手动方式创建可运行的自动化 Agent"
        actions={
          <>
            <Link href="/ai" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
              AI 中心
            </Link>
            <Link href="/agents/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
              对话构建 Agent
            </Link>
          </>
        }
      />
      <div className="px-8 space-y-7">
        {/* 模板库 */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">模板库 — 一键创建</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="bg-gradient-to-br from-zinc-50 to-indigo-50/50 rounded-xl border border-dashed border-zinc-300 p-4 flex items-start gap-3">
                <span className="text-2xl">{t.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-800">{t.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.description}</div>
                  <form action={cloneAgentAction.bind(null, t.id)} className="mt-2">
                    <button className="text-xs rounded-md bg-white border border-zinc-200 px-2.5 py-1 text-indigo-600 hover:border-indigo-300">
                      用此模板创建
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 我的 */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">我的 Agent（{mine.length}）</h2>
          {mine.length ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {mine.map((a) => (
                <AgentCard key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-400 bg-white rounded-xl border border-zinc-200/80 p-6 text-center">
              还没有 Agent。用上面的模板一键创建，或自己从零组装一个。
            </div>
          )}
        </div>

        {/* 团队共享 */}
        {shared.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">团队共享（{shared.length}）</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {shared.map((a) => (
                <AgentCard key={a.id} a={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
