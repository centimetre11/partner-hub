import Link from "next/link";
import { Badge, EmptyState, fmtDate } from "@/components/ui";
import { db } from "@/lib/db";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { requireUser } from "@/lib/session";
import { isTodoOverdue, overdueDueDateBefore } from "@/lib/todo-dates";
import { todoLinkLabel } from "@/lib/todo-display";
import type { Prisma } from "@prisma/client";
import { MobileBusinessRecordCapture, MobileTodoCapture } from "./mobile-desk-actions";
import { MobileDirectorySearch } from "./mobile-directory-search";
import { MeetingScheduler } from "@/components/meeting-scheduler";
import { getMeetingSchedulerContext } from "@/lib/meeting-context";

type ActionTileProps = {
  eyebrow: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
  href?: string;
  actionLabel?: string;
};

function ActionTile({ eyebrow, title, desc, children, href, actionLabel }: ActionTileProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-base font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-500">{desc}</p>
      <div className="mt-4">
        {children ??
          (href && (
            <Link href={href} className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              {actionLabel}
            </Link>
          ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/15 p-4 text-white backdrop-blur">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-white/70">{label}</div>
    </div>
  );
}

export default async function MobileDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open: openAction } = await searchParams;
  const user = await requireUser();
  const { messages: m, labels, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const desk = m.mobileDesk;
  const now = new Date();
  const myTodoWhere: Prisma.TodoItemWhereInput = {
    status: "OPEN",
    OR: [{ assigneeId: user.id }, { assigneeId: null }],
  };

  const [
    todos,
    openTodoCount,
    overdueTodoCount,
    activePartnerCount,
    activeCustomerCount,
    recentRecords,
    activePartners,
    activeCustomers,
    users,
    meetingCtx,
  ] = await Promise.all([
    db.todoItem.findMany({
      where: myTodoWhere,
      include: {
        partner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    db.todoItem.count({ where: myTodoWhere }),
    db.todoItem.count({
      where: {
        ...myTodoWhere,
        dueDate: { lt: overdueDueDateBefore(now) },
      },
    }),
    db.partner.count({ where: { status: "ACTIVE" } }),
    db.customer.count({ where: { status: { in: ["ACTIVE", "PROSPECT"] } } }),
    db.businessRecord.findMany({
      include: {
        partner: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 5,
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, tier: true, country: true },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      select: { id: true, name: true, country: true, status: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getMeetingSchedulerContext(user.id),
  ]);

  const scenario = desk.scenarios;
  const partnerOptions = activePartners.map((p) => ({ id: p.id, name: p.name }));
  const customerOptions = activeCustomers.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="min-h-full min-w-0 max-w-full overflow-x-hidden bg-slate-50 pb-24">
      <div className="mx-auto box-border w-full max-w-5xl min-w-0 px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[1.75rem] bg-slate-950 shadow-sm">
          <div className="relative p-5 sm:p-8">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
              <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />
              <div className="absolute bottom-0 left-12 h-44 w-44 rounded-full bg-purple-400/20 blur-3xl" />
            </div>
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">{desk.heroEyebrow}</div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{desk.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{desk.desc}</p>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <StatCard label={desk.stats.openTodos} value={openTodoCount} />
                <StatCard label={desk.stats.overdueTodos} value={overdueTodoCount} tone="text-red-200" />
                <StatCard label={desk.stats.activePartners} value={activePartnerCount} tone="text-sky-200" />
                <StatCard label={desk.stats.activeCustomers} value={activeCustomerCount} tone="text-emerald-200" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionTile
            eyebrow={scenario.browseTodos.eyebrow}
            title={scenario.browseTodos.title}
            desc={scenario.browseTodos.desc}
            href="#my-todos"
            actionLabel={scenario.browseTodos.action}
          />
          <ActionTile eyebrow={scenario.createTodo.eyebrow} title={scenario.createTodo.title} desc={scenario.createTodo.desc}>
            <MobileTodoCapture
              userId={user.id}
              partners={partnerOptions}
              customers={customerOptions}
              users={users}
              labels={desk.todoDrawer}
              autoOpen={openAction === "todo"}
            />
          </ActionTile>
          <ActionTile eyebrow={scenario.businessRecord.eyebrow} title={scenario.businessRecord.title} desc={scenario.businessRecord.desc}>
            <MobileBusinessRecordCapture
              partners={partnerOptions}
              customers={customerOptions}
              labels={desk.recordDrawer}
              autoOpen={openAction === "record"}
            />
          </ActionTile>
          <ActionTile
            eyebrow={scenario.browseDirectory.eyebrow}
            title={scenario.browseDirectory.title}
            desc={scenario.browseDirectory.desc}
            href="#directory"
            actionLabel={scenario.browseDirectory.action}
          />
          <ActionTile
            eyebrow={scenario.scheduleMeeting.eyebrow}
            title={scenario.scheduleMeeting.title}
            desc={scenario.scheduleMeeting.desc}
          >
            <MeetingScheduler
              currentUserId={user.id}
              organizerName={user.name}
              googleMeetConnected={meetingCtx.googleMeetConnected}
              wecomScheduleConfigured={meetingCtx.wecomScheduleConfigured}
              boundUsers={meetingCtx.boundUsers}
              variant="drawer"
              autoOpen={openAction === "meeting"}
            />
          </ActionTile>
        </section>

        <section id="my-todos" className="mt-5 scroll-mt-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{desk.myTodos}</h2>
            <Link href="/todos" className="text-xs font-medium text-sky-700 hover:underline">
              {desk.viewAllTodos}
            </Link>
          </div>
          <div className="space-y-3 p-4">
            {todos.map((todo) => {
              const overdue = todo.dueDate && isTodoOverdue(todo.dueDate, now);
              const owner = todo.customer ?? todo.partner;
              const ownerHref = todo.customer ? `/customers/${todo.customer.id}` : todo.partner ? `/partners/${todo.partner.id}` : null;
              return (
                <div key={todo.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {todo.title}
                        {(() => {
                          const label = todoLinkLabel(todo, { opportunity: m.common.linkOpportunity, project: m.common.linkProject });
                          return label ? (
                            <span className="ml-1 inline-block rounded-full bg-white px-1.5 py-0.5 text-[10px] font-normal text-slate-500 align-middle">
                              {label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        {todo.dueDate && (
                          <span className={overdue ? "font-semibold text-red-600" : ""}>
                            {fmtDate(todo.dueDate, bcp47)}
                            {overdue ? ` ${m.common.overdue}` : ""}
                          </span>
                        )}
                        {todo.assignee && <span>{todo.assignee.name}</span>}
                      </div>
                      {owner && ownerHref && (
                        <Link href={ownerHref} className="mt-2 inline-flex text-xs font-medium text-sky-700 hover:underline">
                          {owner.name}
                        </Link>
                      )}
                    </div>
                    <Badge tone={overdue ? "red" : "blue"}>{overdue ? desk.overdue : desk.open}</Badge>
                  </div>
                </div>
              );
            })}
            {todos.length === 0 && <EmptyState text={desk.emptyTodos} />}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{desk.recentRecords}</h2>
          </div>
          <div className="space-y-3 p-4">
            {recentRecords.map((record) => {
              const owner = record.customer ?? record.partner;
              const ownerHref = record.customer ? `/customers/${record.customer.id}` : record.partner ? `/partners/${record.partner.id}` : null;
              return (
                <div key={record.id} className="rounded-2xl border border-slate-100 p-3">
                  <div className="text-sm font-medium text-slate-900">{record.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{fmtDate(record.occurredAt, bcp47)}</div>
                  {owner && ownerHref && (
                    <Link href={ownerHref} className="mt-2 inline-flex text-xs font-medium text-sky-700 hover:underline">
                      {owner.name}
                    </Link>
                  )}
                </div>
              );
            })}
            {recentRecords.length === 0 && <EmptyState text={desk.emptyRecords} />}
          </div>
        </section>

        <section id="directory" className="mt-5 scroll-mt-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{desk.directory.title}</h2>
          </div>
          <div className="p-4">
            <MobileDirectorySearch
              partners={activePartners}
              customers={activeCustomers}
              labels={desk.directory}
              unknownRegion={desk.unknownRegion}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
