import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, fmtDate, TierBadge } from "@/components/ui";
import { staleDays } from "@/lib/completeness";
import { toggleTodoAction } from "@/lib/actions";
import { WeeklyReport } from "./weekly-report";
import { AiAddButton } from "@/components/ai-add-button";
import { BoardOverview } from "./dashboard/board-overview";
import { getServerI18n, labelConstants, stageName } from "@/lib/server-i18n";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const isBoard = tab === "board";
  const { labels, messages: m, bcp47, locale } = await getServerI18n();
  const L = labelConstants(labels);
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
        <h1 className="text-lg sm:text-xl font-bold text-zinc-900">
          {greeting}，{user.name}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {dateStr} · {m.app.hubTagline}
        </p>
        <div className="mt-4 flex gap-1 border-b border-zinc-200">
          {tabs.map((t) => {
            const active = (t.key === "board") === isBoard;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={`px-3.5 py-2 text-sm -mb-px border-b-2 transition-colors ${
                  active
                    ? "border-indigo-600 text-indigo-600 font-medium"
                    : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      {isBoard ? <BoardOverview /> : <WorkOverview userId={user.id} now={now} m={m} L={L} bcp47={bcp47} labels={labels} />}
    </div>
  );
}

type WorkProps = {
  userId: string;
  now: Date;
  m: Awaited<ReturnType<typeof getServerI18n>>["messages"];
  L: ReturnType<typeof labelConstants>;
  bcp47: string;
  labels: Awaited<ReturnType<typeof getServerI18n>>["labels"];
};

async function WorkOverview({ userId, now, m, L, bcp47, labels }: WorkProps) {
  const in7days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [myTodos, overdueTodos, activePartners, activeCount, openTodoCount, activeOppCount, unreadNotifications] = await Promise.all([
    db.todoItem.findMany({
      where: { status: "OPEN", OR: [{ assigneeId: userId }, { assigneeId: null }], dueDate: { lte: in7days } },
      include: { partner: true },
      orderBy: { dueDate: "asc" },
      take: 12,
    }),
    db.todoItem.findMany({
      where: { status: "OPEN", dueDate: { lt: now } },
      include: { partner: true, assignee: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      include: { events: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.partner.count({ where: { status: "ACTIVE" } }),
    db.todoItem.count({ where: { status: "OPEN" } }),
    db.opportunity.count({ where: { status: "ACTIVE", partner: { status: "ACTIVE" } } }),
    db.notification.findMany({
      where: { readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { agentRun: { include: { agent: true } } },
    }),
  ]);

  const stalePartners = activePartners
    .map((p) => ({ p, days: staleDays({ events: p.events, updatedAt: p.updatedAt }) }))
    .filter((x) => x.days > 30)
    .sort((a, b) => b.days - a.days);

  const pocPlusCount = activePartners.filter((p) => p.pipelineStage >= 5).length;
  const signedPlusCount = activePartners.filter((p) => p.pipelineStage >= 7).length;

  return (
    <>
      <div className="px-8 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: m.dashboard.statsActivePartners, value: activeCount, href: "/partners", tone: "text-indigo-600" },
          { label: m.dashboard.pocBeyond, value: pocPlusCount, href: "/partners", tone: "text-purple-600" },
          { label: m.dashboard.statsActiveOpps, value: activeOppCount, href: "/partners", tone: "text-sky-600" },
          { label: m.dashboard.stalePartners, value: stalePartners.length, href: "/partners", tone: stalePartners.length ? "text-red-600" : "text-emerald-600" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 hover:border-indigo-300 transition-colors">
            <div className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</div>
            <div className="text-xs text-zinc-400 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {(openTodoCount > 0 || overdueTodos.length > 0 || signedPlusCount > 0) && (
        <div className="px-8 mb-4 flex flex-wrap gap-3 text-xs">
          {openTodoCount > 0 && (
            <Link href="/todos" className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-zinc-600 hover:border-indigo-300">
              {m.dashboard.openTodosChip} <span className="font-semibold text-zinc-900">{openTodoCount}</span>
            </Link>
          )}
          {overdueTodos.length > 0 && (
            <Link href="/todos" className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700 hover:border-red-300">
              {m.dashboard.overdueTodosChip} <span className="font-semibold">{overdueTodos.length}</span>
            </Link>
          )}
          {signedPlusCount > 0 && (
            <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-indigo-700">
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
                  <div key={t.id} className="flex items-start gap-2.5">
                    <form action={toggleTodoAction.bind(null, t.id)}>
                      <button className="w-4 h-4 mt-0.5 rounded border border-zinc-300 hover:border-indigo-400" />
                    </form>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-800">{t.title}</div>
                      <div className="text-xs text-red-500">
                        {fmtDate(t.dueDate, bcp47)} {m.common.overdue}
                        {t.partner && (
                          <>
                            {" · "}
                            <Link href={`/partners/${t.partner.id}`} className="text-indigo-600 hover:underline">
                              {t.partner.name}
                            </Link>
                          </>
                        )}
                        {t.assignee && ` · ${t.assignee.name}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title={m.dashboard.weekTodosTitle} actions={<Link href="/todos" className="text-xs text-indigo-600 hover:underline">{m.common.viewAll} →</Link>}>
            <div className="space-y-2.5">
              {myTodos.map((t) => {
                const overdue = t.dueDate && new Date(t.dueDate) < now;
                return (
                  <div key={t.id} className="flex items-start gap-2.5">
                    <form action={toggleTodoAction.bind(null, t.id)}>
                      <button className="w-4 h-4 mt-0.5 rounded border border-zinc-300 hover:border-indigo-400" />
                    </form>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-800">
                        {t.title}
                        {t.source === "AI" && <span className="ml-1.5 text-[10px] text-purple-500">AI</span>}
                      </div>
                      <div className="text-xs text-zinc-400">
                        <span className={overdue ? "text-red-500" : ""}>{fmtDate(t.dueDate, bcp47)}</span>
                        {t.partner && (
                          <>
                            {" · "}
                            <Link href={`/partners/${t.partner.id}`} className="text-indigo-600 hover:underline">
                              {t.partner.name}
                            </Link>
                          </>
                        )}
                        {` · ${L.TODO_PRIORITY_LABELS[t.priority]}`}
                      </div>
                    </div>
                  </div>
                );
              })}
              {myTodos.length === 0 && <EmptyState text={m.dashboard.noWeekTodosEmpty} />}
            </div>
          </Card>

          <Card title={m.dashboard.staleAlertsTitle}>
            <div className="space-y-2.5">
              {stalePartners.map(({ p, days }) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/partners/${p.id}`} className="text-sm font-medium text-zinc-800 hover:text-indigo-600">
                      {p.name}
                    </Link>
                    <TierBadge tier={p.tier} />
                    <span className="text-xs text-zinc-400">{stageName(labels, p.pipelineStage)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-500 font-medium">{m.dashboard.noActivityDays.replace("{days}", String(days))}</span>
                    <Link
                      href={`/partners/${p.id}`}
                      className="text-xs rounded-md border border-zinc-200 px-2 py-1 text-zinc-600 hover:border-indigo-300 hover:text-indigo-600"
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
          {unreadNotifications.length > 0 && (
            <Card
              title={m.dashboard.unreadInboxTitle.replace("{count}", String(unreadNotifications.length))}
              className="border-indigo-200"
              actions={<Link href="/inbox" className="text-xs text-indigo-600 hover:underline">{m.common.viewAll} →</Link>}
            >
              <div className="space-y-2.5">
                {unreadNotifications.map((n) => (
                  <Link key={n.id} href="/inbox" className="block group">
                    <div className="text-sm text-zinc-800 group-hover:text-indigo-600 line-clamp-1">{n.title}</div>
                    <div className="text-xs text-zinc-400 line-clamp-1">
                      {n.proposal && <span className="text-amber-600 mr-1">{m.dashboard.pendingProposal}</span>}
                      {n.content?.slice(0, 80) ?? ""}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          <WeeklyReport />
          <Card title={m.dashboard.quickLinks}>
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300 transition-colors">
                <div className="font-medium text-zinc-800">{m.dashboard.aiOnboarding}</div>
                <div className="text-xs text-zinc-400 mt-0.5 mb-2">{m.dashboard.aiOnboardingDesc}</div>
                <AiAddButton scope="new_partner" label={m.dashboard.startOnboarding} variant="soft" />
              </div>
              <Link href="/partners?tier=A" className="block rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300 transition-colors">
                <div className="font-medium text-zinc-800">{m.dashboard.tierAPartners}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{m.dashboard.tierAPartnersDesc}</div>
              </Link>
              <Link href="/?tab=board" className="block rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300 transition-colors">
                <div className="font-medium text-zinc-800">{m.dashboard.businessDashboardLink}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{m.dashboard.businessDashboardDesc}</div>
              </Link>
              <Link href="/pool" className="block rounded-lg border border-dashed border-zinc-200 px-4 py-2.5 hover:border-zinc-300 transition-colors">
                <div className="text-xs text-zinc-500">{m.dashboard.prospectPoolLink}</div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
