import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { toMeetingClient } from "@/lib/partner-review/meeting-client";
import { DeleteMeetingButton } from "../delete-meeting-button";
import { MeetingWorkspace } from "./meeting-workspace";
import { isMossConfigured } from "@/lib/moss";
import { MOSS_ENABLED } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/locale-server";
import { formatMsg, getMessages } from "@/lib/i18n/messages";

/** 会后提炼会并行调多次 AI，避免默认超时导致「点了没写入」 */
export const maxDuration = 300;

export default async function PartnerReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const locale = await getLocale();
  const t = getMessages(locale).partnerReview;
  const { id } = await params;

  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          partner: { select: { id: true, name: true, tier: true } },
          todoDrafts: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  if (!meeting) notFound();

  const statusLabel = {
    DRAFT: { label: t.statusDraft, tone: "zinc" as const }, PREP: { label: t.statusPrep, tone: "blue" as const },
    LIVE: { label: t.statusLive, tone: "amber" as const }, PROCESSING: { label: t.statusProcessing, tone: "purple" as const },
    DONE: { label: t.statusDone, tone: "green" as const },
  };
  const st = statusLabel[meeting.status as keyof typeof statusLabel] ?? statusLabel.DRAFT;
  const client = toMeetingClient(meeting);
  const allPartners = await db.partner.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, tier: true },
  });
  const mossConfigured = MOSS_ENABLED && (await isMossConfigured());

  return (
    <div className="pb-16">
      <PageHeader
        title={meeting.title}
        desc={formatMsg(t.partnersMeta, { n: meeting.items.length, name: meeting.createdBy.name })}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {meeting.status !== "DONE" ? (
              <DeleteMeetingButton
                meetingId={meeting.id}
                meetingTitle={meeting.title}
                redirectTo="/partner-reviews"
              />
            ) : null}
          </div>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-3 max-w-7xl">
        <div className="text-xs text-slate-500">
          <Link href="/ops" className="hover:text-slate-800">
            {t.crumbOps}
          </Link>
          <span className="mx-2">·</span>
          <Link href="/partner-reviews" className="hover:text-slate-800">
            {t.crumbReviews}
          </Link>
          <span className="mx-2">·</span>
          <Link href="/settings#integrations" className="hover:text-slate-800">
            {t.crumbIntegrations}
          </Link>
        </div>

        {/* key 仅用会议 id：切伙伴/改 status 时切勿整页重挂 */}
        <MeetingWorkspace key={meeting.id} meeting={client} allPartners={allPartners} mossConfigured={mossConfigured} />
      </div>
    </div>
  );
}
