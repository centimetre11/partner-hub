import Link from "next/link";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { OpsCenterNav } from "@/components/ops-center-nav";
import { WeeklyReportSetup } from "@/app/(app)/settings/weekly-report-setup";
import {
  getWeeklyReportSnapshotAction,
  getWeeklyReportStatusAction,
  listWeeklyReportSnapshotsAction,
} from "@/lib/weekly-report-actions";
import { getServerI18n } from "@/lib/server-i18n";
import { WeeklyReportHistory } from "./weekly-report-history";

export default async function OpsWeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; id?: string }>;
}) {
  await requireSuperAdmin();
  const { messages: m } = await getServerI18n();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "setup";
  const snapshotId = typeof sp.id === "string" ? sp.id : "";

  const [status, users, historyItems, selected] = await Promise.all([
    getWeeklyReportStatusAction(),
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true },
    }),
    tab === "history" ? listWeeklyReportSnapshotsAction() : Promise.resolve([]),
    tab === "history" && snapshotId
      ? getWeeklyReportSnapshotAction(snapshotId)
      : Promise.resolve(null),
  ]);

  const members = users.map((u) => ({ id: u.id, name: u.name, email: u.email }));

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active
        ? "border-slate-900 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
    }`;

  return (
    <div className="pb-16">
      <PageHeader title={m.ops.weeklyReport} desc={m.ops.weeklyReportDesc} />
      <OpsCenterNav />
      <div className="px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div className="flex gap-1 border-b border-slate-200 mb-4">
          <Link href="/ops/weekly-report" className={tabClass(tab === "setup")}>
            {m.ops.weeklyTabSetup}
          </Link>
          <Link href="/ops/weekly-report?tab=history" className={tabClass(tab === "history")}>
            {m.ops.weeklyTabHistory}
          </Link>
        </div>

        {tab === "setup" ? (
          <Card title={m.ops.weeklyTabSetup}>
            <WeeklyReportSetup status={status} members={members} />
          </Card>
        ) : (
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
        )}
      </div>
    </div>
  );
}
