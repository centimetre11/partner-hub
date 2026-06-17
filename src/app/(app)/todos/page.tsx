import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { TODO_PRIORITY_LABELS } from "@/lib/constants";
import { createTodoAction, deleteTodoAction, toggleTodoAction } from "@/lib/actions";
import { TodoEditButton } from "@/components/todo-edit-button";

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; assignee?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = sp.filter ?? "open";

  const todos = await db.todoItem.findMany({
    where: {
      ...(filter === "open" ? { status: "OPEN" } : filter === "done" ? { status: "DONE" } : {}),
      ...(filter === "overdue" ? { status: "OPEN", dueDate: { lt: new Date() } } : {}),
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
    { k: "open", label: "Open" },
    { k: "mine", label: "Mine" },
    { k: "overdue", label: "Overdue" },
    { k: "done", label: "Done" },
    { k: "all", label: "All" },
  ];

  const input = "rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const openTodos = todos.filter((t) => t.status !== "DONE");
  const doneTodos = todos.filter((t) => t.status === "DONE");

  const renderRow = (t: (typeof todos)[number]) => {
    const overdue = t.status === "OPEN" && t.dueDate && new Date(t.dueDate) < new Date();
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
            {t.source === "SEED" && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-sky-50 text-sky-600">Plan</span>}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {t.dueDate && (
              <span className={overdue ? "text-red-500 font-medium" : ""}>
                {fmtDate(t.dueDate)}
                {overdue && " Overdue"}
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
            {` · ${TODO_PRIORITY_LABELS[t.priority]} priority`}
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
              title="Delete todo"
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
      <PageHeader
        title="Todos"
        desc="Link partners and assignees; overdue items are highlighted in red · Initial todos from the 12-week action timeline"
      />
      <div className="px-8">
        {/* Create */}
        <form action={createTodoAction} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4 mb-5 flex flex-wrap gap-2">
          <input name="title" required placeholder="New todo…" className={`${input} flex-1 min-w-[200px]`} />
          <select name="partnerId" className={input}>
            <option value="">No partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="assigneeId" defaultValue={user.id} className={input}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input name="dueDate" type="date" className={input} />
          <select name="priority" defaultValue="MEDIUM" className={input}>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <button className="rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-medium hover:bg-indigo-700">Add</button>
        </form>

        {/* Tab */}
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

        {/* List */}
        {todos.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm">
            <EmptyState text="No todos match this filter" />
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
                  Done
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
