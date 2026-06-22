import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { toggleAutomationAction } from "@/lib/automation-actions";
import { describeCron, formatScheduleShort } from "@/lib/cron";
import { getServerI18n } from "@/lib/server-i18n";

export default async function AutomationsPage() {
  await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [automations, recentRuns, runningCount, todayCount, successRuns, totalRuns] = await Promise.all([
    db.agent.findMany({
      where: { isAutomation: true, isTemplate: false },
      include: {
        createdBy: true,
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
        _count: { select: { runs: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.agentRun.findMany({
      where: { agent: { isAutomation: true } },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { agent: true },
    }),
    db.agentRun.count({ where: { status: "RUNNING", agent: { isAutomation: true } } }),
    db.agentRun.count({
      where: { startedAt: { gte: todayStart }, agent: { isAutomation: true } },
    }),
    db.agentRun.count({ where: { status: "SUCCESS", agent: { isAutomation: true } } }),
    db.agentRun.count({ where: { agent: { isAutomation: true } } }),
  ]);

  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 100;

  return (
    <div className="pb-16">
      <PageHeader
        title={m.automations.title}
        desc={m.automations.desc}
        actions={
          <Link
            href="/automations/new"
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
          >
            {m.automations.createNew}
          </Link>
        }
      />
      <AiCenterNav />

      <div className="px-8">
        <div className="flex flex-col xl:flex-row gap-6 max-w-7xl">
          {/* Main: automations list */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">{runningCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.automations.statRunning}</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums">{todayCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.automations.statToday}</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600 tabular-nums">{successRate}%</div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.automations.statSuccessRate}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-800">{m.automations.allList}</span>
              <Badge tone="zinc">{String(automations.length)}</Badge>
            </div>

            {automations.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200/80 p-10 text-center">
                <div className="text-3xl mb-3">⚡</div>
                <p className="text-sm text-slate-500">{m.automations.noActive}</p>
                <Link href="/automations/new" className="inline-block mt-4 text-sm text-sky-600 hover:underline">
                  {m.automations.createFirst}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {automations.map((a) => (
                  <div
                    key={a.id}
                    className={`bg-white rounded-lg border shadow-sm p-4 ${
                      a.enabled ? "border-slate-200/80" : "border-slate-100 opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/automations/${a.id}`} className="min-w-0 flex-1 group">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{a.icon}</span>
                          <span className="text-sm font-semibold text-slate-900 group-hover:text-sky-600 truncate">
                            {a.name}
                          </span>
                          {!a.enabled && (
                            <Badge tone="zinc">{m.common.paused}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {a.trigger === "SCHEDULE" && a.cronExpr
                            ? describeCron(a.cronExpr, locale)
                            : m.automations.manualTrigger}
                          {" · "}
                          {a._count.runs} {m.automations.runs}
                          {a.runs[0] && (
                            <>
                              {" · "}
                              {m.common.updated} {fmtDateTime(a.runs[0].startedAt, bcp47)}
                            </>
                          )}
                        </div>
                      </Link>
                      <form action={toggleAutomationAction.bind(null, a.id)}>
                        <button
                          type="submit"
                          className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                            a.enabled ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                          title={a.enabled ? m.automations.enabledTitle : m.automations.disabledTitle}
                        />
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: activity feed */}
          <aside className="w-full xl:w-80 shrink-0 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-800">{m.automations.allActivity}</span>
              <Badge tone="zinc">{String(recentRuns.length)}</Badge>
            </div>

            {recentRuns.length === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200/80 p-8 text-center">
                <p className="text-sm text-slate-500">{m.automations.emptyFeed}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRuns.map((run) => {
                  const schedule =
                    run.agent.trigger === "SCHEDULE" && run.agent.cronExpr
                      ? describeCron(run.agent.cronExpr, locale)
                      : m.automations.manualTrigger;
                  return (
                    <Link
                      key={run.id}
                      href={`/automations/${run.agentId}`}
                      className="block bg-white rounded-lg border border-slate-200/80 shadow-sm p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge
                          tone={
                            run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"
                          }
                        >
                          {run.status === "SUCCESS"
                            ? m.common.success
                            : run.status === "FAILED"
                              ? m.common.failed
                              : m.common.running}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {fmtDateTime(run.startedAt, bcp47)}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {run.agent.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{schedule}</div>
                      {run.output && (
                        <p className="text-xs text-slate-600 mt-2 line-clamp-2 whitespace-pre-wrap">
                          {run.output.slice(0, 200)}
                        </p>
                      )}
                      {run.status === "FAILED" && run.error && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">{run.error}</p>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
