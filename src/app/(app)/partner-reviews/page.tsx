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

export default async function PartnerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser();
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
        title="过伙伴会议"
        desc="选一批伙伴开会：会前准备、会中打标、会后确认摘要；已确认的会议可在历史中回看。"
        actions={tab === "active" ? <CreateReviewMeetingForm partners={partners} /> : undefined}
      />
      <OpsCenterNav />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4 max-w-7xl">
        <div className="flex gap-1 border-b border-slate-200">
          <Link href="/partner-reviews" className={tabClass(tab === "active")}>
            进行中
          </Link>
          <Link href="/partner-reviews?tab=history" className={tabClass(tab === "history")}>
            历史会议
          </Link>
        </div>

        <Card title={tab === "history" ? "历史会议" : "进行中的会议"}>
          {!meetings.length ? (
            <EmptyState
              text={
                tab === "history"
                  ? "还没有已确认的历史会议。确认写入商务记录与待办后，会出现在这里。"
                  : "还没有进行中的过伙伴会议。点击右上角「新建过伙伴会议」开始。"
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {meetings.map((m) => {
                const st = STATUS_LABEL[m.status] ?? STATUS_LABEL.DRAFT!;
                const partnerNames = m.items.map((i) => i.partner.name).slice(0, 4);
                const more = m.items.length - partnerNames.length;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/partner-reviews/${m.id}`}
                      className="flex flex-wrap items-center gap-3 py-3 hover:bg-slate-50/80 px-1 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{m.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {m.items.length} 个伙伴
                          {partnerNames.length
                            ? ` · ${partnerNames.join("、")}${more > 0 ? ` 等` : ""}`
                            : ""}
                          {" · "}
                          {m.createdBy.name}
                          {" · "}
                          {tab === "history" && m.endedAt
                            ? `结束于 ${fmtDateTime(m.endedAt)}`
                            : fmtDateTime(m.createdAt)}
                        </div>
                      </div>
                      <Badge tone={st.tone}>{tab === "history" ? "查看摘要" : st.label}</Badge>
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
