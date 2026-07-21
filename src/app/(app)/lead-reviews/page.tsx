import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { CreateLeadReviewForm } from "./create-form";
import { DeleteLeadReviewButton } from "./delete-button";
import { listLeadReviewSalesmen } from "@/lib/lead-review/select";
import { getLeadReviewLastConfigAction } from "@/lib/lead-review/actions";
import { parseLeadReviewConfig } from "@/lib/lead-review/types";

const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }> = {
  DRAFT: { label: "草稿", tone: "zinc" },
  PREP: { label: "已准备", tone: "blue" },
  LIVE: { label: "进行中", tone: "amber" },
  PROCESSING: { label: "会后处理", tone: "purple" },
  DONE: { label: "已完成", tone: "green" },
};

export default async function LeadReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "active";

  const [meetings, salesmen, lastConfig] = await Promise.all([
    db.leadReviewMeeting.findMany({
      where: tab === "history" ? { status: "DONE" } : { status: { not: "DONE" } },
      orderBy: tab === "history" ? [{ endedAt: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { name: true } },
        items: { select: { id: true, source: true, displayName: true, verdict: true } },
      },
    }),
    listLeadReviewSalesmen(),
    getLeadReviewLastConfigAction(),
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
        title="过线索会议"
        desc="可配置销售范围、Channel / 培育条数，定期复盘最近消化过的线索，区分质量问题与消化能力问题。"
        actions={
          tab === "active" ? (
            <CreateLeadReviewForm salesmen={salesmen} initialConfig={lastConfig} />
          ) : undefined
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4 max-w-7xl">
        <div className="flex gap-1 border-b border-slate-200">
          <Link href="/lead-reviews" className={tabClass(tab === "active")}>
            进行中
          </Link>
          <Link href="/lead-reviews?tab=history" className={tabClass(tab === "history")}>
            历史会议
          </Link>
        </div>

        <Card title={tab === "history" ? "历史会议" : "进行中的会议"}>
          {!meetings.length ? (
            <EmptyState
              text={
                tab === "history"
                  ? "还没有已完成的过线索会议。"
                  : "还没有进行中的过线索会议。点击右上角新建并配置取样。"
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {meetings.map((m) => {
                const st = STATUS_LABEL[m.status] ?? STATUS_LABEL.DRAFT!;
                const cfg = parseLeadReviewConfig(m.configJson);
                const names = m.items.map((i) => i.displayName).filter(Boolean).slice(0, 4);
                const more = m.items.length - names.length;
                const channelN = m.items.filter((i) => i.source === "CHANNEL").length;
                const nurtureN = m.items.filter((i) => i.source === "NURTURE").length;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 px-1">
                    <Link
                      href={`/lead-reviews/${m.id}`}
                      className="min-w-0 flex-1 flex flex-wrap items-center gap-3 hover:bg-slate-50/80 rounded-lg -mx-1 px-1 py-0.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{m.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Channel {channelN} · 培育 {nurtureN}
                          {cfg.allSalesmen ? " · 全部销售" : ` · ${cfg.salesmanNames.length} 名销售`}
                          {names.length ? ` · ${names.join("、")}${more > 0 ? " 等" : ""}` : ""}
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
                    {tab === "active" ? (
                      <DeleteLeadReviewButton meetingId={m.id} meetingTitle={m.title} />
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
