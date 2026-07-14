import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isSuperAdmin } from "@/lib/user-roles";
import { Badge, Card, PageHeader, fmtDateTime } from "@/components/ui";
import { OpsCenterNav } from "@/components/ops-center-nav";
import { getServerI18n } from "@/lib/server-i18n";
import { getWeeklyReportStatusAction } from "@/lib/weekly-report-actions";

export default async function OpsCenterPage() {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const admin = isSuperAdmin(user);

  const [meetingCount, liveCount, recentMeetings, weeklyStatus] = await Promise.all([
    db.partnerReviewMeeting.count(),
    db.partnerReviewMeeting.count({ where: { status: { in: ["LIVE", "PREP", "PROCESSING"] } } }),
    db.partnerReviewMeeting.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        createdBy: { select: { name: true } },
        items: { select: { id: true } },
      },
    }),
    admin ? getWeeklyReportStatusAction() : Promise.resolve(null),
  ]);

  return (
    <div className="pb-16">
      <PageHeader title={m.ops.title} desc={m.ops.desc} />
      <OpsCenterNav />

      <div className="px-4 sm:px-6 lg:px-8 space-y-6 max-w-7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/partner-reviews"
            className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{m.ops.partnerReviews}</div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ops.partnerReviewsDesc}</p>
              </div>
              <span className="text-2xl opacity-70">◫</span>
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
              <span>{m.ops.meetingTotal.replace("{count}", String(meetingCount))}</span>
              {liveCount > 0 && (
                <Badge tone="amber">{m.ops.meetingActive.replace("{count}", String(liveCount))}</Badge>
              )}
            </div>
            <div className="mt-4 inline-flex rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm">
              {m.ops.openPartnerReviews}
            </div>
          </Link>

          <Link
            href="/ops/weekly-report"
            className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{m.ops.weeklyReport}</div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.ops.weeklyReportDesc}</p>
              </div>
              <span className="text-2xl opacity-70">▤</span>
            </div>
            <div className="mt-4 text-xs text-slate-500">
              {!admin
                ? m.ops.weeklyAdminOnly
                : weeklyStatus?.enabled
                  ? m.ops.weeklyEnabled
                  : m.ops.weeklyDisabled}
            </div>
            <div className="mt-4 inline-flex rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800">
              {m.ops.openWeeklyReport}
            </div>
          </Link>
        </div>

        <Card title={m.ops.recentMeetings}>
          {!recentMeetings.length ? (
            <p className="text-sm text-slate-400 py-6 text-center">{m.ops.noMeetings}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentMeetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link
                    href={`/partner-reviews/${meeting.id}`}
                    className="flex flex-wrap items-center gap-3 py-3 hover:bg-slate-50/80 px-1 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{meeting.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {meeting.items.length} {m.ops.partnersUnit} · {meeting.createdBy.name} ·{" "}
                        {fmtDateTime(meeting.createdAt, bcp47)}
                      </div>
                    </div>
                    <Badge tone="zinc">{meeting.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
