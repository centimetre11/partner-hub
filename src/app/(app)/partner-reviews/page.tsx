import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { CreateReviewMeetingForm } from "./create-form";
import { DeleteMeetingButton } from "./delete-meeting-button";
import { getLocale } from "@/lib/i18n/locale-server";
import { formatMsg, getMessages } from "@/lib/i18n/messages";

export default async function PartnerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser();
  const locale = await getLocale();
  const t = getMessages(locale).partnerReview;
  const statusLabel = {
    DRAFT: { label: t.statusDraft, tone: "zinc" as const }, PREP: { label: t.statusPrep, tone: "blue" as const },
    LIVE: { label: t.statusLive, tone: "amber" as const }, PROCESSING: { label: t.statusProcessing, tone: "purple" as const },
    DONE: { label: t.statusDone, tone: "green" as const },
  };
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "active";

  const [meetings, partners] = await Promise.all([
    db.partnerReviewMeeting.findMany({
      where: tab === "history" ? { status: "DONE" } : { status: { not: "DONE" } },
      orderBy: tab === "history" ? [{ endedAt: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { name: true } },
        items: {
          select: {
            id: true,
            status: true,
            partner: { select: { name: true } },
          },
        },
      },
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tier: true },
    }),
  ]);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active
        ? "border-slate-900 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
    }`;

  return (
    <div className="pb-16 space-y-0">
      <PageHeader
        title={t.title}
        desc={t.desc}
        actions={tab === "active" ? <CreateReviewMeetingForm partners={partners} /> : undefined}
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4 max-w-7xl">
        <div className="flex gap-1 border-b border-slate-200">
          <Link href="/partner-reviews" className={tabClass(tab === "active")}>
            {t.tabActive}
          </Link>
          <Link href="/partner-reviews?tab=history" className={tabClass(tab === "history")}>
            {t.tabHistory}
          </Link>
        </div>

        <Card title={tab === "history" ? t.cardHistory : t.cardActive}>
          {!meetings.length ? (
            <EmptyState
              text={
                tab === "history"
                  ? t.emptyHistory
                  : t.emptyActive
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {meetings.map((m) => {
                const st = statusLabel[m.status as keyof typeof statusLabel] ?? statusLabel.DRAFT;
                const partnerNames = m.items.map((i) => i.partner.name).slice(0, 4);
                const more = m.items.length - partnerNames.length;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 px-1">
                    <Link
                      href={`/partner-reviews/${m.id}`}
                      className="min-w-0 flex-1 flex flex-wrap items-center gap-3 hover:bg-slate-50/80 rounded-lg -mx-1 px-1 py-0.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{m.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatMsg(t.partnersUnit, { n: m.items.length })}
                          {partnerNames.length
                            ? ` · ${partnerNames.join(locale === "zh" ? "、" : ", ")}${more > 0 ? ` ${t.moreSuffix}` : ""}`
                            : ""}
                          {" · "}
                          {m.createdBy.name}
                          {" · "}
                          {tab === "history" && m.endedAt
                            ? formatMsg(t.endedAt, { time: fmtDateTime(m.endedAt) })
                            : fmtDateTime(m.createdAt)}
                        </div>
                      </div>
                      <Badge tone={st.tone}>{tab === "history" ? t.viewSummary : st.label}</Badge>
                    </Link>
                    {tab === "active" ? (
                      <DeleteMeetingButton meetingId={m.id} meetingTitle={m.title} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
