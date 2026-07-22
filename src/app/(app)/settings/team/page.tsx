import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { Card } from "@/components/ui";
import { RegisterForm } from "../register-form";
import { MemberRow } from "../member-row";
import { FeedbackList } from "../feedback-list";
import { getCrmSalesmenAction } from "@/lib/crm-actions";
import { getServerI18n } from "@/lib/server-i18n";

export default async function TeamSettingsPage() {
  await requireSuperAdmin();
  const { messages: m, bcp47 } = await getServerI18n();

  const [users, salesmen, feedbackItems] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" } }),
    getCrmSalesmenAction(),
    db.feedbackSubmission.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { name: true, email: true } },
        assets: { include: { asset: { select: { id: true, filename: true, mimeType: true, kind: true } } } },
      },
    }),
  ]);

  const openFeedbackCount = feedbackItems.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{m.settings.sectionTeam}</h2>
        <p className="text-sm text-slate-500">{m.settings.sectionTeamDesc}</p>
      </div>

      <Card title={m.settings.teamMembersCount.replace("{count}", String(users.length))} className="lg:col-span-2">
        <p className="text-xs text-slate-500 mb-4">{m.settings.teamMembersHint}</p>
        <div className="space-y-3 mb-5">
          {users.map((u) => (
            <MemberRow key={u.id} user={u} salesmen={salesmen} />
          ))}
        </div>
        <RegisterForm />
      </Card>

      <Card
        title={
          openFeedbackCount > 0
            ? m.feedback.adminTitleWithCount.replace("{count}", String(openFeedbackCount))
            : m.feedback.adminTitle
        }
        className="lg:col-span-2"
      >
        <FeedbackList items={feedbackItems} bcp47={bcp47} admin />
      </Card>
    </div>
  );
}
