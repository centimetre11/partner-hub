import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { toMeetingClient } from "@/lib/partner-review/meeting-client";
import { getAsrConfigForClient } from "@/lib/asr/lexicon";
import { DeleteMeetingButton } from "../delete-meeting-button";
import { MeetingWorkspace } from "./meeting-workspace";

const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }> = {
  DRAFT: { label: "草稿", tone: "zinc" },
  PREP: { label: "已准备", tone: "blue" },
  LIVE: { label: "进行中", tone: "amber" },
  PROCESSING: { label: "会后处理", tone: "purple" },
  DONE: { label: "已完成", tone: "green" },
};

export default async function PartnerReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
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

  const st = STATUS_LABEL[meeting.status] ?? STATUS_LABEL.DRAFT!;
  const client = toMeetingClient(meeting);
  const asrConfig = await getAsrConfigForClient();

  return (
    <div className="pb-16">
      <PageHeader
        title={meeting.title}
        desc={`${meeting.items.length} 个伙伴 · ${meeting.createdBy.name}`}
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
            经营
          </Link>
          <span className="mx-2">·</span>
          <Link href="/partner-reviews" className="hover:text-slate-800">
            过伙伴会议
          </Link>
          <span className="mx-2">·</span>
          <Link href="/settings#integrations" className="hover:text-slate-800">
            识别 / 钉钉配置
          </Link>
        </div>

        {/* key 仅用会议 id：切伙伴/开录改 status 时切勿整页重挂，否则会掐断 MediaRecorder */}
        <MeetingWorkspace
          key={meeting.id}
          meeting={client}
          asrOptions={{
            realtimeEnabled: asrConfig.realtimeEnabled,
            chunkSeconds: asrConfig.chunkSeconds,
          }}
        />
      </div>
    </div>
  );
}
