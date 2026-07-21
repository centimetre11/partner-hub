"use client";

import { TodoEditButton } from "@/components/todo-edit-button";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { fmtDate } from "@/components/ui";
import { isTodoOverdue } from "@/lib/todo-dates";
import { useMessages } from "@/lib/i18n/context";
import { todoLinkLabel } from "@/lib/todo-display";
import type { TodoItem, User } from "@prisma/client";

export function TodoItemRow({
  todo,
  partnerId,
  customerId,
  users,
  bcp47,
  deleteAction,
}: {
  todo: TodoItem & {
    assignee: User | null;
    opportunity?: { id: string; name: string } | null;
    project?: { id: string; name: string } | null;
  };
  partnerId?: string | null;
  customerId?: string | null;
  users: User[];
  bcp47: string;
  deleteAction: React.ReactNode;
}) {
  const m = useMessages().common;
  const isDone = todo.status === "DONE";
  const overdue = todo.status === "OPEN" && todo.dueDate && isTodoOverdue(todo.dueDate);
  const linkLabel = todoLinkLabel(todo, { opportunity: m.linkOpportunity, project: m.linkProject });

  return (
    <div className="flex items-start gap-2.5 group">
      <TodoCompleteButton
        todoId={todo.id}
        title={todo.title}
        status={todo.status}
        partnerId={partnerId ?? todo.partnerId}
        customerId={customerId ?? todo.customerId}
      />
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${isDone ? "line-through text-slate-300" : "text-slate-800"}`}>
          {todo.title}
          {todo.source === "AI" && <span className="ml-1.5 text-[10px] text-purple-500">AI</span>}
          {todo.source === "ARR" && (
            <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">ARR</span>
          )}
          {linkLabel && (
            <span className="ml-1 inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 align-middle">
              {linkLabel}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400">
          {todo.dueDate && (
            <span className={overdue ? "text-red-500 font-medium" : ""}>
              {fmtDate(todo.dueDate, bcp47)}
              {overdue && ` ${m.overdue}`}
            </span>
          )}
          {todo.assignee && ` · ${todo.assignee.name}`}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <TodoEditButton
          todo={{
            id: todo.id,
            title: todo.title,
            detail: todo.detail,
            dueDate: todo.dueDate,
            partnerId: todo.partnerId,
            assigneeId: todo.assigneeId,
          }}
          users={users}
        />
        {deleteAction}
      </div>
    </div>
  );
}
