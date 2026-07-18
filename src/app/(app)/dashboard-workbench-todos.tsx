import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";
import { DashboardTodoRow } from "@/components/dashboard-todo-row";
import { type getServerI18n } from "@/lib/server-i18n";

type Messages = Awaited<ReturnType<typeof getServerI18n>>["messages"];

export async function DashboardWorkbenchTodos({
  userId,
  scope,
  now,
  m,
  bcp47,
}: {
  userId: string;
  scope: "mine" | "all";
  now: Date;
  m: Messages;
  bcp47: string;
}) {
  const isAll = scope === "all";

  const [todos, partners, users] = await Promise.all([
    db.todoItem.findMany({
      where: {
        status: "OPEN",
        ...(isAll
          ? {}
          : {
              OR: [{ assigneeId: userId }, { assigneeId: null }],
            }),
      },
      include: {
        partner: true,
        assignee: true,
        customer: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 80,
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const toggle = (
    <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs shrink-0">
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
  );

  return (
    <Card
      id="workbench"
      title={isAll ? m.dashboard.allTodosTitle : m.dashboard.myTodosTitle}
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
          <EmptyState text={isAll ? m.dashboard.noOpenTodosEmpty : m.dashboard.noMyTodosEmpty} />
        )}
      </div>
    </Card>
  );
}
