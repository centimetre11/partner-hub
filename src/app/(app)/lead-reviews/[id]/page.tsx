import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { LeadReviewWorkspace } from "./meeting-workspace";
import { parseLeadReviewConfig } from "@/lib/lead-review/types";
import { summarizeVerdicts } from "@/lib/lead-review/apply";

const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }> = {
  DRAFT: { label: "草稿", tone: "zinc" },
  PREP: { label: "已准备", tone: "blue" },
  LIVE: { label: "进行中", tone: "amber" },
  PROCESSING: { label: "会后处理", tone: "purple" },
  DONE: { label: "已完成", tone: "green" },
};

export default async function LeadReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

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

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 flex items-start gap-3">
        <BackButton fallbackHref="/lead-reviews" />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={meeting.title}
            desc={[
              `Channel ${cfg.channelCount} · 培育 ${cfg.nurtureCount}`,
              cfg.allSalesmen ? "全部销售" : `销售 ${cfg.salesmanNames.join("、") || "—"}`,
              meeting.createdBy.name,
              meeting.startedAt ? `开始 ${fmtDateTime(meeting.startedAt)}` : null,
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
          stats={stats}
          items={meeting.items.map((i) => ({
            id: i.id,
            source: i.source,
            displayName: i.displayName,
            status: i.status,
            verdict: i.verdict,
            coreNotes: i.coreNotes,
            discussedAt: i.discussedAt?.toISOString() ?? null,
            prepBrief: i.prepBrief,
            channelId: i.channelId,
            leadId: i.leadId,
          }))}
        />
      </div>
    </div>
  );
}
