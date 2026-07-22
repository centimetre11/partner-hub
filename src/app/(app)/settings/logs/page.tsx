import { requireSuperAdmin } from "@/lib/session";
import { Card } from "@/components/ui";
import { ActivityLogsCard } from "../activity-logs-card";
import { getActivityLogStats } from "@/lib/activity-log";
import { getServerI18n } from "@/lib/server-i18n";

export default async function LogsSettingsPage() {
  await requireSuperAdmin();
  const { bcp47 } = await getServerI18n();
  const activityStats = await getActivityLogStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">活动日志</h2>
        <p className="text-sm text-slate-500">AI 对话与系统事件日志</p>
      </div>
      <Card title="活动日志" className="lg:col-span-2">
        <ActivityLogsCard stats={activityStats} bcp47={bcp47} />
      </Card>
    </div>
  );
}
