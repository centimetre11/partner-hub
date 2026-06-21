"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleTodoAction } from "@/lib/actions";
import { BusinessRecordForm } from "@/components/business-record-form";
import { TodoEditButton } from "@/components/todo-edit-button";
import { fmtDate } from "@/components/ui";
import { isTodoOverdue } from "@/lib/todo-dates";
import { useMessages } from "@/lib/i18n/context";
import type { TodoItem, User } from "@prisma/client";

export function TodoItemRow({
  todo,
  partnerId,
  users,
  contacts,
  priorityLabel,
  bcp47,
  deleteAction,
}: {
  todo: TodoItem & { assignee: User | null };
  partnerId: string;
  users: User[];
  contacts: { id: string; name: string }[];
  priorityLabel: string;
  bcp47: string;
  deleteAction: React.ReactNode;
}) {
  const pd = useMessages().partnerDetail;
  const m = useMessages().common;
  const router = useRouter();
  const [prompt, setPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const isDone = todo.status === "DONE";
  const overdue = todo.status === "OPEN" && todo.dueDate && isTodoOverdue(todo.dueDate);

  async function markDoneOnly() {
    setLoading(true);
    try {
      await toggleTodoAction(todo.id);
      setPrompt(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    if (isDone) {
      await markDoneOnly();
      return;
    }
    setPrompt(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2.5 group">
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleToggle()}
          className={`w-4.5 h-4.5 mt-0.5 rounded border flex items-center justify-center text-[10px] shrink-0 ${
            isDone ? "bg-slate-900 border-slate-900 text-white" : "border-slate-300 hover:border-slate-400"
          }`}
        >
          {isDone && "✓"}
        </button>
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${isDone ? "line-through text-slate-300" : "text-slate-800"}`}>
            {todo.title}
            {todo.source === "AI" && <span className="ml-1.5 text-[10px] text-purple-500">AI</span>}
          </div>
          <div className="text-xs text-slate-400">
            {todo.dueDate && (
              <span className={overdue ? "text-red-500 font-medium" : ""}>
                {fmtDate(todo.dueDate, bcp47)}{overdue && ` ${m.overdue}`}
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
      {prompt && !isDone && (
        <div className="ml-7 rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
          <div className="text-xs font-medium text-slate-800">{pd.recordAsMilestone}</div>
          <p className="text-xs text-slate-500">{pd.recordAsMilestoneHint}</p>
          <BusinessRecordForm
            owner={{ kind: "partner", id: partnerId }}
            source="TODO"
            sourceTodoId={todo.id}
            defaultTitle={todo.title}
            contacts={contacts}
            compact
            onDone={() => {
              setPrompt(false);
              router.refresh();
            }}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void markDoneOnly()}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {pd.skipMilestone}
          </button>
        </div>
      )}
    </div>
  );
}
