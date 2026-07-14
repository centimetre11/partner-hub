import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { OpsCenterNav } from "@/components/ops-center-nav";
import { CreateReviewMeetingForm } from "./create-form";

const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }> = {
  DRAFT: { label: "草稿", tone: "zinc" },
  PREP: { label: "已准备", tone: "blue" },
  LIVE: { label: "进行中", tone: "amber" },
  PROCESSING: { label: "会后处理", tone: "purple" },
  DONE: { label: "已完成", tone: "green" },
};

export default async function PartnerReviewsPage() {
  await requireUser();

  const [meetings, partners] = await Promise.all([
    db.partnerReviewMeeting.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { name: true } },
        items: { select: { id: true } },
      },
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tier: true },
    }),
  ]);

  return (
    <div className="pb-16 space-y-0">
      <PageHeader
        title="过伙伴会议"
        desc="选一批伙伴开会：会前准备进展与议题，会中点伙伴打标，会后把讨论写入商务记录与待办。"
        actions={<CreateReviewMeetingForm partners={partners} />}
      />
      <OpsCenterNav />

      <div className="px-4 sm:px-6 lg:px-8 space-y-6 max-w-7xl">
      <Card title="会议列表">
        {!meetings.length ? (
          <EmptyState text="还没有过伙伴会议。点击右上角「新建过伙伴会议」，勾选要过的伙伴即可开始。" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {meetings.map((m) => {
              const st = STATUS_LABEL[m.status] ?? STATUS_LABEL.DRAFT!;
              return (
                <li key={m.id}>
                  <Link
                    href={`/partner-reviews/${m.id}`}
                    className="flex flex-wrap items-center gap-3 py-3 hover:bg-slate-50/80 px-1 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{m.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {m.items.length} 个伙伴 · {m.createdBy.name} · {fmtDateTime(m.createdAt)}
                        {m.scheduledAt ? ` · 计划 ${fmtDateTime(m.scheduledAt)}` : ""}
                      </div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </Link>
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
