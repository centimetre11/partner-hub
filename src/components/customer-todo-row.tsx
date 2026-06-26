"use client";

import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { fmtDate } from "@/components/ui";
import { deleteTodoAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";

export function CustomerTodoRow({
  todo,
  customerId,
  bcp47,
  tag,
}: {
  todo: {
    id: string;
    title: string;
    status: string;
    dueDate: Date | null;
    assignee: { name: string } | null;
  };
  customerId: string;
  bcp47: string;
  tag?: { label: string } | null;
}) {
  const m = useMessages();
  const isDone = todo.status === "DONE";

  return (
    <div className="flex items-center gap-3 py-2.5">
      <TodoCompleteButton
        todoId={todo.id}
        title={todo.title}
        status={todo.status}
        customerId={customerId}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${isDone ? "line-through text-slate-300" : "text-slate-800"}`}>{todo.title}</span>
          {tag && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{tag.label}</span>
          )}
        </div>
        <div className="text-xs text-slate-400">
          {todo.dueDate && fmtDate(todo.dueDate, bcp47)}
          {todo.assignee && ` · ${todo.assignee.name}`}
        </div>
      </div>
      <form action={deleteTodoAction.bind(null, todo.id)}>
        <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
          {m.common.delete}
        </button>
      </form>
    </div>
  );
}
