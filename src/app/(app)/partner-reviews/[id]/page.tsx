import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { MeetingWorkspace, toMeetingClient } from "./meeting-workspace";

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

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        <Link href="/partner-reviews" className="hover:text-slate-800">
          ← 过伙伴会议
        </Link>
        <span className="mx-2">·</span>
        <Link href="/settings#integrations" className="hover:text-slate-800">
          钉钉配置
        </Link>
      </div>

      <PageHeader
        title={meeting.title}
        desc={`${meeting.items.length} 个伙伴 · ${meeting.createdBy.name}`}
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />

      <MeetingWorkspace
        key={`${meeting.status}-${meeting.prepGeneratedAt?.toISOString() ?? ""}-${meeting.transcriptText?.length ?? 0}-${meeting.items.map((i) => i.status).join(",")}`}
        meeting={client}
      />
    </div>
  );
}
