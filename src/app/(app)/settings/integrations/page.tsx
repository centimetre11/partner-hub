import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { Card } from "@/components/ui";
import { CrmSyncCard } from "../crm-sync-card";
import { WecomChatsCard } from "../wecom-chats-card";
import { EmailSetup } from "../email-setup";
import { DingTalkSetup } from "../dingtalk-setup";
import { WeeklyReportSetup } from "../weekly-report-setup";
import { getCrmSyncStats } from "@/lib/crm-sync";
import { getEmailConfigForClient } from "@/lib/email-config";
import { getDingTalkConfigForClient } from "@/lib/dingtalk/config";
import { getWeeklyReportStatusAction } from "@/lib/weekly-report-actions";
import { getServerI18n } from "@/lib/server-i18n";
import { getCrmExtraRecordersAction } from "@/lib/crm-actions";

export default async function IntegrationsSettingsPage() {
  await requireSuperAdmin();
  const { messages: m } = await getServerI18n();

  const [crmStats, emailConfig, dingtalkConfig, weeklyReportStatus, extraRecorders] = await Promise.all([
    getCrmSyncStats(),
    getEmailConfigForClient(),
    getDingTalkConfigForClient(),
    getWeeklyReportStatusAction(),
    getCrmExtraRecordersAction(),
  ]);

  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  const weeklyReportMembers = users.map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{m.settings.sectionIntegrations}</h2>
        <p className="text-sm text-slate-500">{m.settings.sectionIntegrationsDesc}</p>
      </div>

      <Card title={m.crm.syncTitle} className="lg:col-span-2">
        <CrmSyncCard
          customerCount={crmStats.customerCount}
          contactCount={crmStats.contactCount}
          lastSyncAt={crmStats.lastSyncAt?.toISOString() ?? null}
          latestStatus={crmStats.latestLog?.status ?? null}
          latestError={crmStats.latestLog?.error ?? null}
          extraRecorders={extraRecorders.join("\n")}
        />
      </Card>

      <WecomChatsCard />

      <Card title={m.settings.dingtalkTitle} className="lg:col-span-2">
        <DingTalkSetup config={dingtalkConfig} />
      </Card>

      <Card title={m.settings.systemEmailTitle} className="lg:col-span-2">
        <EmailSetup config={emailConfig} />
      </Card>

      <Card title={m.settings.weeklyReportTitle} className="lg:col-span-2">
        <WeeklyReportSetup status={weeklyReportStatus} members={weeklyReportMembers} />
      </Card>
    </div>
  );
}
