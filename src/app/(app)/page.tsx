import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, EmptyState, fmtDate, TierBadge } from "@/components/ui";
import { staleDays } from "@/lib/completeness";
import { DashboardOverdueTodoRow } from "@/components/dashboard-todo-row";
import { WeeklyReport } from "./weekly-report";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import { BoardOverview } from "./dashboard/board-overview";
import { DashboardWorkbenchTodos } from "./dashboard-workbench-todos";
import { MeetingScheduler } from "@/components/meeting-scheduler";
import { getMeetingSchedulerContext } from "@/lib/meeting-context";
import { INBOX_NAV_ENABLED } from "@/lib/feature-flags";
import { getServerI18n, stageName } from "@/lib/server-i18n";
import { overdueDueDateBefore } from "@/lib/todo-dates";
import { OPEN_OPPORTUNITY_STATUSES } from "@/lib/opportunity-status";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; todos?: string }>;
}) {
  const user = await requireUser();
  const { tab, todos: todosScope } = await searchParams;
  const isBoard = tab === "board";
  const todoView = todosScope === "all" ? "all" : "mine";
  const { labels, messages: m, bcp47, locale } = await getServerI18n();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? m.greeting.morning : hour < 18 ? m.greeting.afternoon : m.greeting.evening;

  const tabs = [
    { key: "", label: m.dashboard.overview, href: "/" },
    { key: "board", label: m.dashboard.businessBoard, href: "/?tab=board" },
  ];

  const dateStr = now.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="pb-16">
      <div className="px-8 pt-5 sm:pt-7 pb-3">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900">
          {greeting}，{user.name}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {dateStr} · {m.app.hubTagline}
        </p>
        <div className="mt-4 flex gap-1 border-b border-slate-200">
          {tabs.map((t) => {
            const active = (t.key === "board") === isBoard;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={`px-3.5 py-2 text-sm -mb-px border-b-2 ${
                  active
                    ? "border-slate-900 text-slate-900 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      {isBoard ? (
        <BoardOverview />
      ) : (
        <WorkOverview userId={user.id} now={now} todoView={todoView} m={m} bcp47={bcp47} labels={labels} />
      )}
    </div>
  );
}

type WorkProps = {
  userId: string;
  now: Date;
  todoView: "mine" | "all";
  m: Awaited<ReturnType<typeof getServerI18n>>["messages"];
  bcp47: string;
  labels: Awaited<ReturnType<typeof getServerI18n>>["labels"];
};

async function WorkOverview({ userId, now, todoView, m, bcp47, labels }: WorkProps) {
  const [overdueTodos, activePartners, activeCount, openTodoCount, activeOppCount, unreadNotifications, meetingCtx] =
    await Promise.all([
    db.todoItem.findMany({
      where: { status: "OPEN", dueDate: { lt: overdueDueDateBefore(now) } },
      include: {
        partner: true,
        assignee: true,
        customer: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.partner.count({ where: { status: "ACTIVE" } }),
    db.todoItem.count({ where: { status: "OPEN" } }),
    db.opportunity.count({ where: { status: { in: [...OPEN_OPPORTUNITY_STATUSES] }, partner: { status: "ACTIVE" } } }),
    INBOX_NAV_ENABLED
      ? db.notification.findMany({
          where: { readAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { agentRun: { include: { agent: true } } },
        })
      : Promise.resolve([]),
    getMeetingSchedulerContext(userId),
  ]);

  const stalePartners = activePartners
    .map((p) => ({ p, days: staleDays({ events: p.events, updatedAt: p.updatedAt }) }))
    .filter((x) => x.days > 30)
    .sort((a, b) => b.days - a.days);

  const pocPlusCount = activePartners.filter((p) => p.pipelineStage >= 2).length;
  const signedPlusCount = activePartners.filter((p) => p.pipelineStage >= 3).length;

  return (
    <>
      <div className="px-8 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: m.dashboard.statsActivePartners, value: activeCount, href: "/partners", tone: "text-sky-600" },
          { label: m.dashboard.pocBeyond, value: pocPlusCount, href: "/partners", tone: "text-purple-600" },
          { label: m.dashboard.statsActiveOpps, value: activeOppCount, href: "/opportunities", tone: "text-sky-600" },
          { label: m.dashboard.stalePartners, value: stalePartners.length, href: "/partners", tone: stalePartners.length ? "text-red-600" : "text-emerald-600" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300">
            <div className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {(openTodoCount > 0 || overdueTodos.length > 0 || signedPlusCount > 0) && (
        <div className="px-8 mb-4 flex flex-wrap gap-3 text-xs">
          {openTodoCount > 0 && (
            <Link href="/?todos=all#workbench" className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:border-slate-300">
              {m.dashboard.openTodosChip} <span className="font-semibold text-slate-900">{openTodoCount}</span>
            </Link>
          )}
          {overdueTodos.length > 0 && (
            <Link href="/?todos=all#workbench" className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700 hover:border-red-300">
              {m.dashboard.overdueTodosChip} <span className="font-semibold">{overdueTodos.length}</span>
            </Link>
          )}
          {signedPlusCount > 0 && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sky-700">
              {m.dashboard.signedOnboarding} <span className="font-semibold">{signedPlusCount}</span> {m.dashboard.partnersUnit}
            </span>
          )}
        </div>
      )}

      <div className="px-8 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          {overdueTodos.length > 0 && (
            <Card title={m.dashboard.overdueTodosTitle.replace("{count}", String(overdueTodos.length))} className="border-red-200">
              <div className="space-y-2.5">
                {overdueTodos.map((t) => (
                  <DashboardOverdueTodoRow key={t.id} todo={t} bcp47={bcp47} />
                ))}
              </div>
            </Card>
          )}

          <DashboardWorkbenchTodos
            userId={userId}
            scope={todoView}
            now={now}
            m={m}
            bcp47={bcp47}
            labels={labels}
          />

          <Card title={m.dashboard.staleAlertsTitle}>
            <div className="space-y-2.5">
              {stalePartners.map(({ p, days }) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/partners/${p.id}`} className="text-sm font-medium text-slate-800 hover:text-sky-600">
                      {p.name}
                    </Link>
                    <TierBadge tier={p.tier} />
                    <span className="text-xs text-slate-400">{stageName(labels, p.pipelineStage)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-500 font-medium">{m.dashboard.noActivityDays.replace("{days}", String(days))}</span>
                    <Link
                      href={`/partners/${p.id}`}
                      className="text-xs rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:border-slate-300 hover:text-sky-600"
                    >
                      {m.common.review}
                    </Link>
                  </div>
                </div>
              ))}
              {stalePartners.length === 0 && <EmptyState text={m.dashboard.noStaleEmpty} />}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {INBOX_NAV_ENABLED && unreadNotifications.length > 0 && (
            <Card
              title={m.dashboard.unreadInboxTitle.replace("{count}", String(unreadNotifications.length))}
              className="border-slate-200"
              actions={<Link href="/inbox" className="text-xs text-sky-600 hover:underline">{m.common.viewAll} →</Link>}
            >
              <div className="space-y-2.5">
                {unreadNotifications.map((n) => (
                  <Link key={n.id} href="/inbox" className="block group">
                    <div className="text-sm text-slate-800 group-hover:text-sky-600 line-clamp-1">{n.title}</div>
                    <div className="text-xs text-slate-400 line-clamp-1">
                      {n.proposal && <span className="text-amber-600 mr-1">{m.dashboard.pendingProposal}</span>}
                      {n.content?.slice(0, 80) ?? ""}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          <WeeklyReport />
          <Card title={m.dashboard.scheduleMeeting.title}>
            <MeetingScheduler
              currentUserId={userId}
              googleMeetConnected={meetingCtx.googleMeetConnected}
              wecomScheduleConfigured={meetingCtx.wecomScheduleConfigured}
              boundUsers={meetingCtx.boundUsers}
              variant="card"
            />
          </Card>
          <Card title={m.dashboard.quickLinks}>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-slate-100 px-4 py-3 hover:border-slate-300">
                <div className="font-medium text-slate-800">{m.dashboard.aiOnboarding}</div>
                <div className="text-xs text-slate-400 mt-0.5 mb-2">{m.dashboard.aiOnboardingDesc}</div>
                <AiAddButton scope="new_partner" label={m.dashboard.startOnboarding} variant="soft" />
              </div>
              <div className="rounded-lg border border-slate-100 px-4 py-3 hover:border-slate-300">
                <div className="font-medium text-slate-800">{m.dashboard.customerAiOnboarding}</div>
                <div className="text-xs text-slate-400 mt-0.5 mb-2">{m.dashboard.customerAiOnboardingDesc}</div>
                <CustomerAiIntakeButton label={m.dashboard.startCustomerOnboarding} variant="soft" />
              </div>
              <Link href="/partners?tier=A" className="block rounded-lg border border-slate-100 px-4 py-3 hover:border-slate-300">
                <div className="font-medium text-slate-800">{m.dashboard.tierAPartners}</div>
                <div className="text-xs text-slate-400 mt-0.5">{m.dashboard.tierAPartnersDesc}</div>
              </Link>
              <Link href="/pool" className="block rounded-lg border border-dashed border-slate-200 px-4 py-2.5 hover:border-slate-300">
                <div className="text-xs text-slate-500">{m.dashboard.prospectPoolLink}</div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
