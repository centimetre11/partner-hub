import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/session";
import { getServerI18n } from "@/lib/server-i18n";
import { getUserActivityTimeline } from "@/lib/activity-log";
import { Badge, Card, EmptyState, fmtDateTime } from "@/components/ui";

export default async function UserAnalyticsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireSuperAdmin();
  const { userId } = await params;
  const { bcp47 } = await getServerI18n();
  const { user, items } = await getUserActivityTimeline(userId, 100);

  if (!user) notFound();

  const pageViews = items.filter((i) => i.source === "behavior" && i.eventType === "PAGE_VIEW").length;
  const behaviors = items.filter((i) => i.source === "behavior").length;
  const systems = items.filter((i) => i.source === "system").length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/analytics" className="text-xs text-sky-600 hover:underline">
          ← 返回行为分析
        </Link>
        <h2 className="text-base font-semibold text-slate-900 mt-2">{user.name}</h2>
        <p className="text-sm text-slate-500">
          {user.email} · {user.role}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard value={pageViews} label="页面访问（近期）" />
        <StatCard value={behaviors} label="行为事件" />
        <StatCard value={systems} label="服务端操作" />
      </div>

      <Card title="操作时间线" className="lg:col-span-2">
        {items.length ? (
          <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
            {items.map((row) => (
              <div key={row.id} className="flex items-start gap-2 px-3 py-2.5 text-sm min-w-0">
                <span className="text-xs text-slate-400 shrink-0 tabular-nums w-[72px] pt-0.5">
                  {fmtDateTime(row.createdAt, bcp47)}
                </span>
                <Badge tone={row.source === "system" ? "blue" : "zinc"}>
                  {row.source === "system" ? "操作" : row.eventType}
                </Badge>
                <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
                  {row.status === "SUCCESS" ? "成功" : "失败"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-slate-500 shrink-0">{row.action}</span>
                    {row.durationMs != null && (
                      <span className="text-xs text-slate-400 tabular-nums">{row.durationMs}ms</span>
                    )}
                  </div>
                  <div className="text-slate-700 truncate mt-0.5">
                    {row.summary || row.targetLabel || row.pagePath || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="该用户暂无行为记录" />
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
