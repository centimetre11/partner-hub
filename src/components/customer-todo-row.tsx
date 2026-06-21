"use client";

import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { fmtDate } from "@/components/ui";
import { deleteTodoAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";

export function CustomerTodoRow({
  todo,
  customerId,
  contacts,
  bcp47,
}: {
  todo: {
    id: string;
    title: string;
    status: string;
    dueDate: Date | null;
    assignee: { name: string } | null;
  };
  customerId: string;
  contacts: { id: string; name: string }[];
  bcp47: string;
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
        contacts={contacts}
      />
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${isDone ? "line-through text-slate-300" : "text-slate-800"}`}>{todo.title}</div>
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
