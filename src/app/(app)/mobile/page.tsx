import Link from "next/link";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { Badge, EmptyState, fmtDate } from "@/components/ui";
import { db } from "@/lib/db";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { requireUser } from "@/lib/session";
import { isTodoOverdue, overdueDueDateBefore } from "@/lib/todo-dates";
import type { Prisma } from "@prisma/client";

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

export default async function MobileDeskPage() {
  const user = await requireUser();
  const { messages: m, labels, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const desk = m.mobileDesk;
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const myTodoWhere: Prisma.TodoItemWhereInput = {
    status: "OPEN",
    OR: [{ assigneeId: user.id }, { assigneeId: null }],
  };

  const [todos, openTodoCount, overdueTodoCount, records7dCount, recentRecords, partners, users, mobilePartners, mobileCustomers] =
    await Promise.all([
      db.todoItem.findMany({
        where: {
          ...myTodoWhere,
          dueDate: { lte: next7Days },
        },
        include: {
          partner: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 6,
      }),
      db.todoItem.count({ where: myTodoWhere }),
      db.todoItem.count({
        where: {
          ...myTodoWhere,
          dueDate: { lt: overdueDueDateBefore(now) },
        },
      }),
      db.businessRecord.count({ where: { occurredAt: { gte: last7Days } } }),
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
        where: { status: { not: "ARCHIVED" } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.partner.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, tier: true, country: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
      db.customer.findMany({
        where: { status: { in: ["ACTIVE", "PROSPECT"] } },
        select: { id: true, name: true, country: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),
    ]);

  const scenario = desk.scenarios;

  return (
    <div className="min-h-full bg-slate-50 pb-24">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[1.75rem] bg-slate-950 shadow-sm">
          <div className="relative p-5 sm:p-8">
            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute -bottom-20 left-12 h-44 w-44 rounded-full bg-purple-400/20 blur-3xl" />
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">{desk.heroEyebrow}</div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{desk.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{desk.desc}</p>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                <StatCard label={desk.stats.openTodos} value={openTodoCount} />
                <StatCard label={desk.stats.overdueTodos} value={overdueTodoCount} tone="text-red-200" />
                <StatCard label={desk.stats.records7d} value={records7dCount} tone="text-sky-200" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionTile eyebrow={scenario.todo.eyebrow} title={scenario.todo.title} desc={scenario.todo.desc}>
            <CreateTodoDrawer userId={user.id} partners={partners} users={users} />
          </ActionTile>
          <ActionTile
            eyebrow={scenario.businessRecord.eyebrow}
            title={scenario.businessRecord.title}
            desc={scenario.businessRecord.desc}
            href="/partners"
            actionLabel={scenario.businessRecord.action}
          />
          <ActionTile
            eyebrow={scenario.customerNote.eyebrow}
            title={scenario.customerNote.title}
            desc={scenario.customerNote.desc}
          >
            <CustomerAiIntakeButton label={scenario.customerNote.action} variant="primary" />
          </ActionTile>
          <ActionTile eyebrow={scenario.partnerIntake.eyebrow} title={scenario.partnerIntake.title} desc={scenario.partnerIntake.desc}>
            <AiAddButton scope="new_partner" label={scenario.partnerIntake.action} variant="solid" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800" />
          </ActionTile>
        </section>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">{desk.todayFocus}</h2>
              <Link href="/?todos=mine#workbench" className="text-xs font-medium text-sky-700 hover:underline">
                {desk.openFullDesk}
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
                        <div className="text-sm font-medium text-slate-900">{todo.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          {todo.dueDate && (
                            <span className={overdue ? "font-semibold text-red-600" : ""}>
                              {fmtDate(todo.dueDate, bcp47)}
                              {overdue ? ` ${m.common.overdue}` : ""}
                            </span>
                          )}
                          <span>{L.TODO_PRIORITY_LABELS[todo.priority]}</span>
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

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
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
        </div>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{desk.mobileTargets}</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            {[...mobilePartners.map((p) => ({ ...p, href: `/partners/${p.id}`, meta: p.country ?? desk.unknownRegion })), ...mobileCustomers.map((c) => ({ ...c, href: `/customers/${c.id}`, meta: c.country ?? desk.unknownRegion }))].map((item) => (
              <Link key={item.href} href={item.href} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 hover:border-slate-300">
                <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
                <div className="mt-1 text-xs text-slate-500">{item.meta}</div>
              </Link>
            ))}
            {mobilePartners.length + mobileCustomers.length === 0 && <EmptyState text={desk.noTargets} />}
          </div>
        </section>
      </div>
    </div>
  );
}
