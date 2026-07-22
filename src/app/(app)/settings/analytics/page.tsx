import { requireSuperAdmin } from "@/lib/session";
import { getServerI18n } from "@/lib/server-i18n";
import { getBehaviorStats, getUserBehaviorTotals, queryUserBehaviorLogs } from "@/lib/activity-log";
import { Badge, Card, EmptyState, fmtDateTime } from "@/components/ui";

export default async function AnalyticsSettingsPage() {
  await requireSuperAdmin();
  const { bcp47 } = await getServerI18n();

  const [totals, stats7, stats30, recent] = await Promise.all([
    getUserBehaviorTotals(),
    getBehaviorStats(7),
    getBehaviorStats(30),
    queryUserBehaviorLogs(1, {}),
  ]);

  const top7Pages = stats7.topPages.slice(0, 10);
  const top7Actions = stats7.topActions.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">行为分析</h2>
        <p className="text-sm text-slate-500">查看用户行为埋点汇总：页面访问、点击、搜索、停留时长等</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard value={totals.today} label="今日事件" />
        <StatCard value={totals.week} label="近 7 天事件" />
        <StatCard value={stats30.total} label="近 30 天事件" />
        <StatCard value={stats7.totalUsers} label="近 7 天活跃用户" />
        <StatCard value={stats7.totalSessions} label="近 7 天活跃会话" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="日活趋势（近 7 天）">
          {stats7.dailyRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-400">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 text-left font-medium">日期</th>
                    <th className="py-2 text-right font-medium">事件数</th>
                    <th className="py-2 text-right font-medium">用户数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {stats7.dailyRows.map((row) => (
                    <tr key={row.day}>
                      <td className="py-2 text-slate-700">{row.day}</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{row.count}</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{row.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </Card>

        <Card title="事件类型分布（近 7 天）">
          {stats7.eventTypes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-400">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 text-left font-medium">事件类型</th>
                    <th className="py-2 text-right font-medium">数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {stats7.eventTypes.map((row) => (
                    <tr key={row.eventType}>
                      <td className="py-2 text-slate-700">
                        <Badge tone="zinc">{row.eventType}</Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{row._count.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="页面访问 Top 10（近 7 天）">
          {top7Pages.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-400">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 text-left font-medium">页面路径</th>
                    <th className="py-2 text-right font-medium">访问次数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {top7Pages.map((row) => (
                    <tr key={row.pagePath ?? "_empty_"}>
                      <td className="py-2 text-slate-700 truncate max-w-xs" title={row.pagePath ?? undefined}>
                        {row.pagePath || "（未知）"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{row._count.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </Card>

        <Card title="关键操作 Top 10（近 7 天）">
          {top7Actions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-400">
                  <tr className="border-b border-slate-100">
                    <th className="py-2 text-left font-medium">操作</th>
                    <th className="py-2 text-right font-medium">次数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {top7Actions.map((row) => (
                    <tr key={row.action}>
                      <td className="py-2 text-slate-700">
                        <Badge tone="zinc">{row.action}</Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{row._count.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="暂无数据" />
          )}
        </Card>
      </div>

      <Card title="最近行为日志" className="lg:col-span-2">
        {recent.items.length ? (
          <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
            {recent.items.map((row) => (
              <div key={row.id} className="flex items-center gap-2 px-3 py-2 text-sm min-w-0">
                <span className="text-xs text-slate-400 shrink-0 tabular-nums w-[72px]">
                  {fmtDateTime(new Date(row.createdAt), bcp47)}
                </span>
                <Badge tone="zinc">{row.eventType}</Badge>
                <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
                  {row.status === "SUCCESS" ? "成功" : "失败"}
                </Badge>
                <span className="text-xs font-mono text-slate-400 shrink-0">{row.action}</span>
                <span className="text-slate-700 truncate min-w-0 flex-1">
                  {row.pagePath || row.targetLabel || row.targetId || "—"}
                </span>
                <span className="text-xs text-slate-400 shrink-0">{row.user?.name ?? "匿名"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="暂无行为日志" />
        )}
      </Card>
    </div>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
