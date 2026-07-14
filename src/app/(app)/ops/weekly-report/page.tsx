import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { OpsCenterNav } from "@/components/ops-center-nav";
import { WeeklyReportSetup } from "@/app/(app)/settings/weekly-report-setup";
import { getWeeklyReportStatusAction } from "@/lib/weekly-report-actions";
import { getServerI18n } from "@/lib/server-i18n";

export default async function OpsWeeklyReportPage() {
  await requireSuperAdmin();
  const { messages: m } = await getServerI18n();

  const [status, users] = await Promise.all([
    getWeeklyReportStatusAction(),
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const members = users.map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return (
    <div className="pb-16">
      <PageHeader title={m.ops.weeklyReport} desc={m.ops.weeklyReportDesc} />
      <OpsCenterNav />
      <div className="px-4 sm:px-6 lg:px-8 max-w-4xl">
        <Card title={m.ops.weeklyReport}>
          <WeeklyReportSetup status={status} members={members} />
        </Card>
      </div>
    </div>
  );
}
