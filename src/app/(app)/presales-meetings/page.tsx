import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { ListPagination } from "@/components/list-pagination";
import { CreatePresalesMeetingForm } from "./create-form";
import { getLocale } from "@/lib/i18n/locale-server";
import { formatMsg, getMessages } from "@/lib/i18n/messages";
import { parseListPage } from "@/lib/list-pagination";

export default async function PresalesMeetingsPage({
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
  const m = msgs.presalesMeeting;

  const STATUS_LABEL: Record<
    string,
    { label: string; tone: "zinc" | "blue" | "amber" | "green" | "purple" }
  > = {
    DRAFT: { label: m.statusDraft, tone: "zinc" },
    PREP: { label: m.statusPrep, tone: "blue" },
    LIVE: { label: m.statusLive, tone: "amber" },
    PROCESSING: { label: m.statusProcessing, tone: "purple" },
    DONE: { label: m.statusDone, tone: "green" },
  };

  const meetingWhere =
    tab === "history" ? { status: "DONE" as const } : { status: { not: "DONE" as const } };

  const [meetings, total, users, customers, projects] = await Promise.all([
    db.presalesProjectMeeting.findMany({
      where: meetingWhere,
      orderBy:
        tab === "history"
          ? [{ endedAt: "desc" }, { createdAt: "desc" }]
          : { createdAt: "desc" },
      skip,
      take,
      include: {
        createdBy: { select: { name: true } },
        items: {
          select: {
            id: true,
            user: { select: { name: true } },
            customer: { select: { name: true } },
            project: { select: { name: true } },
          },
        },
      },
    }),
    db.presalesProjectMeeting.count({ where: meetingWhere }),
    db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.customer.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
    db.project.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, name: true, customerId: true },
    }),
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
            <CreatePresalesMeetingForm users={users} customers={customers} projects={projects} />
          ) : undefined
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4 max-w-7xl">
        <div className="flex gap-1 border-b border-slate-200">
          <Link href="/presales-meetings" className={tabClass(tab === "active")}>
            {m.activeTab}
          </Link>
          <Link href="/presales-meetings?tab=history" className={tabClass(tab === "history")}>
            {m.historyTab}
          </Link>
        </div>

        {!meetings.length ? (
          <EmptyState text={m.empty} />
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => {
              const st = STATUS_LABEL[meeting.status] ?? STATUS_LABEL.DRAFT!;
              return (
                <Card key={meeting.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/presales-meetings/${meeting.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-sky-800"
                        >
                          {meeting.title}
                        </Link>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {meeting.createdBy.name}
                        {meeting.scheduledAt
                          ? ` · ${fmtDateTime(meeting.scheduledAt)}`
                          : ""}
                        {" · "}
                        {formatMsg(m.itemsCount, { n: meeting.items.length })}
                      </p>
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {meeting.items
                          .slice(0, 4)
                          .map(
                            (it) =>
                              `${it.user.name} · ${it.customer.name} / ${it.project.name}`,
                          )
                          .join(" · ")}
                        {meeting.items.length > 4 ? "…" : ""}
                      </p>
                    </div>
                    <Link
                      href={`/presales-meetings/${meeting.id}`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                    >
                      {m.openWorkspace}
                    </Link>
                  </div>
                </Card>
              );
            })}
            <ListPagination
              pathname="/presales-meetings"
              searchParams={filterParams}
              page={page}
              pageSize={take}
              total={total}
              labels={pageLabels}
            />
          </div>
        )}
      </div>
    </div>
  );
}
