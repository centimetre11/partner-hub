import { requireSuperAdmin } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { OpsCenterNav } from "@/components/ops-center-nav";
import {
  getWeeklyReportSnapshotAction,
  listWeeklyReportSnapshotsAction,
} from "@/lib/weekly-report-actions";
import { getServerI18n } from "@/lib/server-i18n";
import { WeeklyReportHistory } from "./weekly-report-history";

export default async function OpsWeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireSuperAdmin();
  const { messages: m } = await getServerI18n();
  const sp = await searchParams;
  const snapshotId = typeof sp.id === "string" ? sp.id : "";

  const [historyItems, selected] = await Promise.all([
    listWeeklyReportSnapshotsAction(),
    snapshotId ? getWeeklyReportSnapshotAction(snapshotId) : Promise.resolve(null),
  ]);

  return (
    <div className="pb-16">
      <PageHeader title={m.ops.weeklyReport} desc={m.ops.weeklyReportDesc} />
      <OpsCenterNav />
      <div className="px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Card title={m.ops.weeklyTabHistory}>
          <WeeklyReportHistory
            items={historyItems}
            selected={selected}
            labels={{
              empty: m.ops.weeklyHistoryEmpty,
              emptyHint: m.ops.weeklyHistoryEmptyHint,
              personal: m.ops.weeklyHistoryPersonal,
              managerDigest: m.ops.weeklyHistoryManager,
              sourceScheduled: m.ops.weeklyHistorySourceScheduled,
              sourceManual: m.ops.weeklyHistorySourceManual,
              sourceTest: m.ops.weeklyHistorySourceTest,
              backToList: m.ops.weeklyHistoryBack,
              week: m.ops.weeklyHistoryWeek,
              generatedAt: m.ops.weeklyHistoryGeneratedAt,
              open: m.ops.weeklyHistoryOpen,
            }}
          />
        </Card>
      </div>
    </div>
  );
}
