import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { LeadReviewWorkspace } from "./meeting-workspace";
import { parseLeadReviewConfig } from "@/lib/lead-review/types";
import { summarizeVerdicts } from "@/lib/lead-review/apply";
import { loadMeetingItemFacts } from "@/lib/lead-review/brief";
import { getLocale } from "@/lib/i18n/locale-server";
import { formatMsg, getMessages } from "@/lib/i18n/messages";

export default async function LeadReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const locale = await getLocale();
  const m = getMessages(locale).leadReview;

  const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }> = {
    DRAFT: { label: m.statusDraft, tone: "zinc" },
    PREP: { label: m.statusPrep, tone: "blue" },
    LIVE: { label: m.statusLive, tone: "amber" },
    PROCESSING: { label: m.statusProcessing, tone: "purple" },
    DONE: { label: m.statusDone, tone: "green" },
  };

  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!meeting) notFound();

  const st = STATUS_LABEL[meeting.status] ?? STATUS_LABEL.DRAFT!;
  const cfg = parseLeadReviewConfig(meeting.configJson);
  const stats =
    meeting.status === "DONE"
      ? summarizeVerdicts(meeting.items.map((i) => ({ source: i.source, verdict: i.verdict })))
      : null;
  const facts = await loadMeetingItemFacts(meeting.items);

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 flex items-start gap-3">
        <BackButton fallbackHref="/lead-reviews" />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={meeting.title}
            desc={[
              formatMsg(m.metaChannel, { n: cfg.channelCount }),
              formatMsg(m.metaNurture, { n: cfg.nurtureCount }),
              cfg.allSalesmen
                ? m.metaAllSales
                : formatMsg(m.metaSales, { names: cfg.salesmanNames.join("、") || "—" }),
              meeting.createdBy.name,
              meeting.startedAt
                ? formatMsg(m.metaStarted, { time: fmtDateTime(meeting.startedAt) })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={<Badge tone={st.tone}>{st.label}</Badge>}
          />
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl">
        <LeadReviewWorkspace
          meetingId={meeting.id}
          status={meeting.status}
          liveNotes={meeting.liveNotes}
          transcriptStatus={meeting.transcriptStatus}
          transcriptError={meeting.transcriptError}
          transcriptText={meeting.transcriptText ?? meeting.xfyunTranscriptText}
          tencentTranscriptText={meeting.tencentTranscriptText}
          tencentLiveNotes={meeting.tencentLiveNotes}
          xfyunTranscriptText={meeting.xfyunTranscriptText}
          xfyunLiveNotes={meeting.xfyunLiveNotes}
          matchSource={meeting.matchSource}
          startedAt={meeting.startedAt?.toISOString() ?? null}
          stats={stats}
          facts={facts}
          items={meeting.items.map((i) => ({
            id: i.id,
            source: i.source,
            displayName: i.displayName,
            status: i.status,
            verdict: i.verdict,
            coreNotes: i.coreNotes,
            discussedAt: i.discussedAt?.toISOString() ?? null,
            markerInsertedAt: i.markerInsertedAt?.toISOString() ?? null,
            prepBrief: i.prepBrief,
            channelId: i.channelId,
            leadId: i.leadId,
          }))}
        />
      </div>
    </div>
  );
}
