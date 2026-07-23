import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { ListPagination } from "@/components/list-pagination";
import { CreateLeadReviewForm } from "./create-form";
import { DeleteLeadReviewButton } from "./delete-button";
import { listLeadReviewSalesmen } from "@/lib/lead-review/select";
import { getLeadReviewLastConfigAction } from "@/lib/lead-review/actions";
import { parseLeadReviewConfig } from "@/lib/lead-review/types";
import { getLocale } from "@/lib/i18n/locale-server";
import { formatMsg, getMessages } from "@/lib/i18n/messages";
import { parseListPage } from "@/lib/list-pagination";

export default async function LeadReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "active";
  const { page, take, skip } = parseListPage(sp.page);
  const locale = await getLocale();
  const msgs = getMessages(locale);
  const m = msgs.leadReview;

  const STATUS_LABEL: Record<string, { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }> = {
    DRAFT: { label: m.statusDraft, tone: "zinc" },
    PREP: { label: m.statusPrep, tone: "blue" },
    LIVE: { label: m.statusLive, tone: "amber" },
    PROCESSING: { label: m.statusProcessing, tone: "purple" },
    DONE: { label: m.statusDone, tone: "green" },
  };

  const meetingWhere = tab === "history" ? { status: "DONE" as const } : { status: { not: "DONE" as const } };

  const [meetings, total, salesmen, lastConfig] = await Promise.all([
    db.leadReviewMeeting.findMany({
      where: meetingWhere,
      orderBy: tab === "history" ? [{ endedAt: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
      skip,
      take,
      include: {
        createdBy: { select: { name: true } },
        items: { select: { id: true, source: true, displayName: true, verdict: true } },
      },
    }),
    db.leadReviewMeeting.count({ where: meetingWhere }),
    listLeadReviewSalesmen(),
    getLeadReviewLastConfigAction(),
  ]);

  const pageLabels = {
    prevPage: msgs.common.prevPage,
    nextPage: msgs.common.nextPage,
    pageOf: msgs.common.pageOf,
  };
  const filterParams = { tab: tab === "history" ? "history" : undefined };

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active
        ? "border-slate-900 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
    }`;

  return (
    <div className="pb-16 space-y-0">
      <PageHeader
        title={m.title}
        desc={m.desc}
        actions={
          tab === "active" ? (
            <CreateLeadReviewForm salesmen={salesmen} initialConfig={lastConfig} />
          ) : undefined
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4 max-w-7xl">
        <div className="flex gap-1 border-b border-slate-200">
          <Link href="/lead-reviews" className={tabClass(tab === "active")}>
            {m.tabActive}
          </Link>
          <Link href="/lead-reviews?tab=history" className={tabClass(tab === "history")}>
            {m.tabHistory}
          </Link>
        </div>

        <Card title={tab === "history" ? m.cardHistory : m.cardActive}>
          {!meetings.length ? (
            <EmptyState text={tab === "history" ? m.emptyHistory : m.emptyActive} />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {meetings.map((mtg) => {
                const st = STATUS_LABEL[mtg.status] ?? STATUS_LABEL.DRAFT!;
                const cfg = parseLeadReviewConfig(mtg.configJson);
                const names = mtg.items.map((i) => i.displayName).filter(Boolean).slice(0, 4);
                const more = mtg.items.length - names.length;
                const channelN = mtg.items.filter((i) => i.source === "CHANNEL").length;
                const nurtureN = mtg.items.filter((i) => i.source === "NURTURE").length;
                return (
                  <li key={mtg.id} className="flex flex-wrap items-center gap-3 py-3 px-1">
                    <Link
                      href={`/lead-reviews/${mtg.id}`}
                      className="min-w-0 flex-1 flex flex-wrap items-center gap-3 hover:bg-slate-50/80 rounded-lg -mx-1 px-1 py-0.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900 truncate">{mtg.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatMsg(m.channelN, { n: channelN })} ·{" "}
                          {formatMsg(m.nurtureN, { n: nurtureN })}
                          {cfg.allSalesmen
                            ? ` · ${m.allSales}`
                            : ` · ${formatMsg(m.salesCount, { n: cfg.salesmanNames.length })}`}
                          {names.length
                            ? ` · ${names.join(locale === "zh" ? "、" : ", ")}${more > 0 ? (locale === "zh" ? " 等" : "…") : ""}`
                            : ""}
                          {" · "}
                          {mtg.createdBy.name}
                          {" · "}
                          {tab === "history" && mtg.endedAt
                            ? formatMsg(m.endedAt, { time: fmtDateTime(mtg.endedAt) })
                            : fmtDateTime(mtg.createdAt)}
                        </div>
                      </div>
                      <Badge tone={st.tone}>{tab === "history" ? m.viewSummary : st.label}</Badge>
                    </Link>
                    {tab === "active" ? (
                      <DeleteLeadReviewButton meetingId={mtg.id} meetingTitle={mtg.title} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <ListPagination
              pathname="/lead-reviews"
              searchParams={filterParams}
              page={page}
              total={total}
              pageSize={take}
              labels={pageLabels}
            />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
