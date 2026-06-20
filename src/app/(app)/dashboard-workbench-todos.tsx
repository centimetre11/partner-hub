import Link from "next/link";
import { db } from "@/lib/db";
import { Card, EmptyState, fmtDate } from "@/components/ui";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { deleteTodoAction, toggleTodoAction } from "@/lib/actions";
import { TodoEditButton } from "@/components/todo-edit-button";
import { labelConstants, type getServerI18n } from "@/lib/server-i18n";
import { isTodoOverdue } from "@/lib/todo-dates";

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

  const [todos, partners, users] = await Promise.all([
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
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const toggle = (
    <div className="flex items-center gap-2 shrink-0">
      <CreateTodoDrawer userId={userId} partners={partners} users={users} />
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
        {todos.map((t) => {
          const overdue = t.dueDate && isTodoOverdue(t.dueDate, now);
          return (
            <div key={t.id} className="flex items-start gap-2.5 group">
              <form action={toggleTodoAction.bind(null, t.id)}>
                <button
                  type="submit"
                  className="w-4 h-4 mt-0.5 rounded border border-slate-300 hover:border-slate-400 shrink-0"
                  aria-label={m.common.done}
                />
              </form>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-800">
                  {t.title}
                  {t.source === "AI" && <span className="ml-1.5 text-[10px] text-purple-500">AI</span>}
                </div>
                <div className="text-xs text-slate-400">
                  {t.dueDate && (
                    <span className={overdue ? "text-red-500 font-medium" : ""}>
                      {fmtDate(t.dueDate, bcp47)}
                      {overdue && ` ${m.common.overdue}`}
                    </span>
                  )}
                  {t.partner && (
                    <>
                      {t.dueDate && " · "}
                      <Link href={`/partners/${t.partner.id}`} className="text-sky-600 hover:underline">
                        {t.partner.name}
                      </Link>
                    </>
                  )}
                  {(t.dueDate || t.partner) && " · "}
                  {L.TODO_PRIORITY_LABELS[t.priority]}
                  {isAll && t.assignee && ` · ${t.assignee.name}`}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 shrink-0">
                <TodoEditButton
                  todo={{
                    id: t.id,
                    title: t.title,
                    detail: t.detail,
                    dueDate: t.dueDate,
                    priority: t.priority,
                    partnerId: t.partnerId,
                    assigneeId: t.assigneeId,
                  }}
                  partners={partners}
                  users={users}
                />
                <form action={deleteTodoAction.bind(null, t.id)}>
                  <button
                    type="submit"
                    title={m.todos.deleteTitle}
                    className="text-slate-300 hover:text-red-500 text-sm px-1"
                  >
                    ✕
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {todos.length === 0 && (
          <EmptyState text={isAll ? m.dashboard.noOpenTodosEmpty : m.dashboard.noWeekTodosEmpty} />
        )}
      </div>
    </Card>
  );
}
