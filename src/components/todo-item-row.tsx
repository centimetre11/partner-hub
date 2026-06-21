"use client";

import { TodoEditButton } from "@/components/todo-edit-button";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { fmtDate } from "@/components/ui";
import { isTodoOverdue } from "@/lib/todo-dates";
import { useMessages } from "@/lib/i18n/context";
import type { TodoItem, User } from "@prisma/client";

export function TodoItemRow({
  todo,
  partnerId,
  customerId,
  users,
  priorityLabel,
  bcp47,
  deleteAction,
}: {
  todo: TodoItem & { assignee: User | null };
  partnerId?: string | null;
  customerId?: string | null;
  users: User[];
  priorityLabel: string;
  bcp47: string;
  deleteAction: React.ReactNode;
}) {
  const m = useMessages().common;
  const isDone = todo.status === "DONE";
  const overdue = todo.status === "OPEN" && todo.dueDate && isTodoOverdue(todo.dueDate);

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
        </div>
        <div className="text-xs text-slate-400">
          {todo.dueDate && (
            <span className={overdue ? "text-red-500 font-medium" : ""}>
              {fmtDate(todo.dueDate, bcp47)}
              {overdue && ` ${m.overdue}`}
            </span>
          )}
          {todo.assignee && ` · ${todo.assignee.name}`}
          {` · ${priorityLabel}`}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <TodoEditButton
          todo={{
            id: todo.id,
            title: todo.title,
            detail: todo.detail,
            dueDate: todo.dueDate,
            priority: todo.priority,
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
