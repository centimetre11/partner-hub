import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { DashboardTodoRow } from "@/components/dashboard-todo-row";
import { labelConstants, type getServerI18n } from "@/lib/server-i18n";

type Messages = Awaited<ReturnType<typeof getServerI18n>>["messages"];

export async function DashboardWorkbenchTodos({
  userId,
  scope,
  now,
  m,
  bcp47,
  labels,
}: {
  userId: string;
  scope: "mine" | "all";
  now: Date;
  m: Messages;
  bcp47: string;
  labels: Awaited<ReturnType<typeof getServerI18n>>["labels"];
}) {
  const L = labelConstants(labels);
  const isAll = scope === "all";
  const in7days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [todos, partners, customers, users] = await Promise.all([
    db.todoItem.findMany({
      where: {
        status: "OPEN",
        ...(isAll
          ? {}
          : {
              OR: [{ assigneeId: userId }, { assigneeId: null }],
              dueDate: { lte: in7days },
            }),
      },
      include: { partner: true, assignee: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: isAll ? 80 : 20,
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const toggle = (
    <div className="flex items-center gap-2 shrink-0">
      <CreateTodoDrawer userId={userId} partners={partners} customers={customers} users={users} />
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
      <Link
        href="/?todos=mine"
        scroll={false}
        className={`rounded-md px-2.5 py-1 ${
          !isAll ? "bg-white text-slate-900 shadow-sm font-medium" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {m.common.mine}
      </Link>
      <Link
        href="/?todos=all"
        scroll={false}
        className={`rounded-md px-2.5 py-1 ${
          isAll ? "bg-white text-slate-900 shadow-sm font-medium" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {m.common.viewAll}
      </Link>
      </div>
    </div>
  );

  return (
    <Card
      id="workbench"
      title={isAll ? m.dashboard.allTodosTitle : m.dashboard.weekTodosTitle}
      actions={toggle}
    >
      <div className="space-y-2.5">
        {todos.map((t) => (
          <DashboardTodoRow
            key={t.id}
            todo={t}
            partners={partners}
            users={users}
            bcp47={bcp47}
            showAssignee={isAll}
            now={now}
          />
        ))}
        {todos.length === 0 && (
          <EmptyState text={isAll ? m.dashboard.noOpenTodosEmpty : m.dashboard.noWeekTodosEmpty} />
        )}
      </div>
    </Card>
  );
}
