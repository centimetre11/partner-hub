import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { createTodoAction, deleteTodoAction, toggleTodoAction } from "@/lib/actions";
import { TodoEditButton } from "@/components/todo-edit-button";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { isTodoOverdue, overdueDueDateBefore } from "@/lib/todo-dates";

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; assignee?: string }>;
}) {
  const user = await requireUser();
  const { labels: _labels, messages: m, bcp47 } = await getServerI18n();
  const L = labelConstants(_labels);
  const sp = await searchParams;
  const filter = sp.filter ?? "open";

  const todos = await db.todoItem.findMany({
    where: {
      ...(filter === "open" ? { status: "OPEN" } : filter === "done" ? { status: "DONE" } : {}),
      ...(filter === "overdue" ? { status: "OPEN", dueDate: { lt: overdueDueDateBefore() } } : {}),
      ...(filter === "mine" ? { status: "OPEN", assigneeId: user.id } : {}),
      ...(sp.assignee ? { assigneeId: sp.assignee } : {}),
    },
    include: { partner: true, assignee: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const users = await db.user.findMany();

  const tabs = [
    { k: "open", label: m.common.open },
    { k: "mine", label: m.common.mine },
    { k: "overdue", label: m.todos.overdueTab },
    { k: "done", label: m.common.done },
    { k: "all", label: m.todos.allTab },
  ];

  const input = "rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const openTodos = todos.filter((t) => t.status !== "DONE");
  const doneTodos = todos.filter((t) => t.status === "DONE");

  const renderRow = (t: (typeof todos)[number]) => {
    const overdue = t.status === "OPEN" && t.dueDate && isTodoOverdue(t.dueDate);
    return (
      <div key={t.id} className="flex items-start gap-3 px-5 py-3.5 group">
        <form action={toggleTodoAction.bind(null, t.id)}>
          <button
            className={`w-[18px] h-[18px] mt-0.5 rounded-md border flex items-center justify-center text-[10px] transition-colors ${
              t.status === "DONE" ? "bg-indigo-600 border-indigo-600 text-white" : "border-zinc-300 hover:border-indigo-400"
            }`}
          >
            {t.status === "DONE" && "✓"}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${t.status === "DONE" ? "line-through text-zinc-300" : "text-zinc-800"}`}>
            {t.title}
            {t.source === "AI" && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-purple-50 text-purple-600">AI</span>}
            {t.source === "SEED" && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-sky-50 text-sky-600">{m.common.plan}</span>}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {t.dueDate && (
              <span className={overdue ? "text-red-500 font-medium" : ""}>
                {fmtDate(t.dueDate, bcp47)}
                {overdue && ` ${m.common.overdue}`}
              </span>
            )}
            {t.partner && (
              <>
                {" · "}
                <Link href={`/partners/${t.partner.id}`} className="text-indigo-600 hover:underline">
                  {t.partner.name}
                </Link>
              </>
            )}
            {t.assignee && ` · ${t.assignee.name}`}
            {` · ${L.TODO_PRIORITY_LABELS[t.priority]} ${m.todos.prioritySuffix}`}
            {t.detail && ` · ${t.detail}`}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
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
              title={m.todos.deleteTitle}
              className="text-zinc-300 hover:text-red-500 text-sm transition-colors opacity-60 group-hover:opacity-100"
            >
              ✕
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-16">
      <PageHeader title={m.todos.title} desc={m.todos.desc} />
      <div className="px-8">
        <form action={createTodoAction} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4 mb-5 flex flex-wrap gap-2">
          <input name="title" required placeholder={m.todos.newPlaceholder} className={`${input} flex-1 min-w-[200px]`} />
          <select name="partnerId" className={input}>
            <option value="">{m.todos.noPartner}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="assigneeId" defaultValue={user.id} className={input} aria-label={m.common.owner} title={m.common.owner}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input name="dueDate" type="date" className={input} />
          <select name="priority" defaultValue="MEDIUM" className={input}>
            <option value="HIGH">{m.common.high}</option>
            <option value="MEDIUM">{m.common.medium}</option>
            <option value="LOW">{m.common.low}</option>
          </select>
          <button className="rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-medium hover:bg-indigo-700">{m.common.add}</button>
        </form>

        <div className="flex gap-1.5 mb-4">
          {tabs.map((t) => (
            <Link
              key={t.k}
              href={`/todos?filter=${t.k}`}
              className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                filter === t.k ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {todos.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm">
            <EmptyState text={m.todos.empty} />
          </div>
        ) : (
          <div className="space-y-4">
            {openTodos.length > 0 && (
              <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-50">
                {openTodos.map(renderRow)}
              </div>
            )}

            {doneTodos.length > 0 && (
              <details open={openTodos.length === 0} className="group/done bg-white rounded-xl border border-zinc-200/80 shadow-sm overflow-hidden">
                <summary className="flex items-center gap-2 px-5 py-3 cursor-pointer select-none text-sm text-zinc-500 hover:bg-zinc-50 list-none">
                  <span className="transition-transform group-open/done:rotate-90 text-zinc-400">▸</span>
                  {m.common.done}
                  <span className="text-xs text-zinc-400">({doneTodos.length})</span>
                </summary>
                <div className="divide-y divide-zinc-50 border-t border-zinc-100">
                  {doneTodos.map(renderRow)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
