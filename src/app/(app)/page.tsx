import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, fmtDate, tierTone } from "@/components/ui";
import { stageName, TODO_PRIORITY_LABELS } from "@/lib/constants";
import { staleDays } from "@/lib/completeness";
import { toggleTodoAction } from "@/lib/actions";
import { WeeklyReport } from "./weekly-report";
import { AiAddButton } from "@/components/ai-add-button";
import { BoardOverview } from "./dashboard/board-overview";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const isBoard = tab === "board";
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const tabs = [
    { key: "", label: "Overview", href: "/" },
    { key: "board", label: "Business Dashboard", href: "/?tab=board" },
  ];

  return (
    <div className="pb-16">
      <div className="px-8 pt-5 sm:pt-7 pb-3">
        <h1 className="text-lg sm:text-xl font-bold text-zinc-900">
          {greeting}，{user.name}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {now.toLocaleDateString("en-US", { month: "long", day: "numeric", weekday: "long" })} · MEA Partner Operations Hub
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
      {isBoard ? <BoardOverview /> : <WorkOverview userId={user.id} now={now} />}
    </div>
  );
}

async function WorkOverview({ userId, now }: { userId: string; now: Date }) {
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
          { label: "Active Partners", value: activeCount, href: "/partners", tone: "text-indigo-600" },
          { label: "POC & Beyond (≥5)", value: pocPlusCount, href: "/partners", tone: "text-purple-600" },
          { label: "Active Opportunities", value: activeOppCount, href: "/partners", tone: "text-sky-600" },
          { label: "Stale Partners (>30d)", value: stalePartners.length, href: "/partners", tone: stalePartners.length ? "text-red-600" : "text-emerald-600" },
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
              Open todos <span className="font-semibold text-zinc-900">{openTodoCount}</span>
            </Link>
          )}
          {overdueTodos.length > 0 && (
            <Link href="/todos" className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700 hover:border-red-300">
              Overdue todos <span className="font-semibold">{overdueTodos.length}</span>
            </Link>
          )}
          {signedPlusCount > 0 && (
            <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-indigo-700">
              Signed Onboarding+ <span className="font-semibold">{signedPlusCount}</span> partners
            </span>
          )}
        </div>
      )}

      <div className="px-8 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          {/* 逾期警报 */}
          {overdueTodos.length > 0 && (
            <Card title={`⚠ Overdue Todos (${overdueTodos.length})`} className="border-red-200">
              <div className="space-y-2.5">
                {overdueTodos.map((t) => (
                  <div key={t.id} className="flex items-start gap-2.5">
                    <form action={toggleTodoAction.bind(null, t.id)}>
                      <button className="w-4 h-4 mt-0.5 rounded border border-zinc-300 hover:border-indigo-400" />
                    </form>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-800">{t.title}</div>
                      <div className="text-xs text-red-500">
                        {fmtDate(t.dueDate)} overdue
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

          {/* 本周待办 */}
          <Card title="Todos in Next 7 Days" actions={<Link href="/todos" className="text-xs text-indigo-600 hover:underline">View all →</Link>}>
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
                        <span className={overdue ? "text-red-500" : ""}>{fmtDate(t.dueDate)}</span>
                        {t.partner && (
                          <>
                            {" · "}
                            <Link href={`/partners/${t.partner.id}`} className="text-indigo-600 hover:underline">
                              {t.partner.name}
                            </Link>
                          </>
                        )}
                        {` · ${TODO_PRIORITY_LABELS[t.priority]}`}
                      </div>
                    </div>
                  </div>
                );
              })}
              {myTodos.length === 0 && <EmptyState text="No todos due in the next 7 days" />}
            </div>
          </Card>

          {/* 停滞预警 */}
          <Card title="Stale Partner Alerts (no activity for 30+ days)">
            <div className="space-y-2.5">
              {stalePartners.map(({ p, days }) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/partners/${p.id}`} className="text-sm font-medium text-zinc-800 hover:text-indigo-600">
                      {p.name}
                    </Link>
                    {p.tier && <Badge tone={tierTone(p.tier)}>Tier {p.tier}</Badge>}
                    <span className="text-xs text-zinc-400">{stageName(p.pipelineStage)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-500 font-medium">{days}d no activity</span>
                    <Link
                      href={`/partners/${p.id}`}
                      className="text-xs rounded-md border border-zinc-200 px-2 py-1 text-zinc-600 hover:border-indigo-300 hover:text-indigo-600"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}
              {stalePartners.length === 0 && <EmptyState text="All active partners have recent follow-ups — looking healthy ✓" />}
            </div>
          </Card>
        </div>

        {/* 右栏：AI 周报 */}
        <div className="space-y-5">
          {unreadNotifications.length > 0 && (
            <Card
              title={`✉ Unread Inbox (${unreadNotifications.length})`}
              className="border-indigo-200"
              actions={<Link href="/inbox" className="text-xs text-indigo-600 hover:underline">View all →</Link>}
            >
              <div className="space-y-2.5">
                {unreadNotifications.map((n) => (
                  <Link key={n.id} href="/inbox" className="block group">
                    <div className="text-sm text-zinc-800 group-hover:text-indigo-600 line-clamp-1">{n.title}</div>
                    <div className="text-xs text-zinc-400 line-clamp-1">
                      {n.proposal && <span className="text-amber-600 mr-1">[Pending proposal]</span>}
                      {n.content?.slice(0, 80) ?? ""}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          <WeeklyReport />
          <Card title="Quick Links">
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300 transition-colors">
                <div className="font-medium text-zinc-800">✦ AI Onboarding</div>
                <div className="text-xs text-zinc-400 mt-0.5 mb-2">Drop meeting notes or company intro — AI-guided partner setup</div>
                <AiAddButton scope="new_partner" label="Start onboarding" variant="soft" />
              </div>
              <Link href="/partners?tier=A" className="block rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300 transition-colors">
                <div className="font-medium text-zinc-800">◮ Tier A Partners</div>
                <div className="text-xs text-zinc-400 mt-0.5">View Tier A partners under active cultivation</div>
              </Link>
              <Link href="/?tab=board" className="block rounded-lg border border-zinc-100 px-4 py-3 hover:border-indigo-300 transition-colors">
                <div className="font-medium text-zinc-800">◫ Business Dashboard</div>
                <div className="text-xs text-zinc-400 mt-0.5">Active partner pipeline, completeness & stale alerts</div>
              </Link>
              <Link href="/pool" className="block rounded-lg border border-dashed border-zinc-200 px-4 py-2.5 hover:border-zinc-300 transition-colors">
                <div className="text-xs text-zinc-500">Prospect Pool →</div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
