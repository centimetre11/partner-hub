"use client";

import Link from "next/link";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { TodoEditButton } from "@/components/todo-edit-button";
import { fmtDate } from "@/components/ui";
import { deleteTodoAction } from "@/lib/actions";
import { isTodoOverdue } from "@/lib/todo-dates";
import { useMessages } from "@/lib/i18n/context";
import { todoLinkLabel } from "@/lib/todo-display";

type TodoRow = {
  id: string;
  title: string;
  status: string;
  source: string;
  dueDate: Date | null;
  priority: string;
  partnerId: string | null;
  customerId: string | null;
  opportunityId: string | null;
  projectId: string | null;
  detail: string | null;
  assigneeId: string | null;
  partner: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  assignee: { name: string } | null;
};

function TodoLinkTag({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span className="ml-1 inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 align-middle">
      {label}
    </span>
  );
}

export function DashboardTodoRow({
  todo,
  partners,
  users,
  bcp47,
  showAssignee,
  now,
}: {
  todo: TodoRow;
  partners: { id: string; name: string }[];
  users: { id: string; name: string }[];
  bcp47: string;
  showAssignee?: boolean;
  now?: Date;
}) {
  const m = useMessages();
  const overdue = todo.dueDate && isTodoOverdue(todo.dueDate, now);
  const linkLabel = todoLinkLabel(todo, { opportunity: m.common.linkOpportunity, project: m.common.linkProject });

  return (
    <div className="flex items-start gap-2.5 group">
      <TodoCompleteButton
        todoId={todo.id}
        title={todo.title}
        status={todo.status}
        partnerId={todo.partnerId}
        customerId={todo.customerId}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-800">
          {todo.title}
          {todo.source === "AI" && <span className="ml-1.5 text-[10px] text-purple-500">AI</span>}
          <TodoLinkTag label={linkLabel} />
        </div>
        <div className="text-xs text-slate-400">
          {todo.dueDate && (
            <span className={overdue ? "text-red-500 font-medium" : ""}>
              {fmtDate(todo.dueDate, bcp47)}
              {overdue && ` ${m.common.overdue}`}
            </span>
          )}
          {todo.partner && (
            <>
              {todo.dueDate && " · "}
              <Link href={`/partners/${todo.partner.id}`} className="text-sky-600 hover:underline">
                {todo.partner.name}
              </Link>
            </>
          )}
          {!todo.partner && todo.customer && (
            <>
              {todo.dueDate && " · "}
              <Link href={`/customers/${todo.customer.id}`} className="text-sky-600 hover:underline">
                {todo.customer.name}
              </Link>
            </>
          )}
          {showAssignee && todo.assignee && (
            <>
              {(todo.dueDate || todo.partner || todo.customer) && " · "}
              {todo.assignee.name}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 shrink-0">
        <TodoEditButton
          todo={{
            id: todo.id,
            title: todo.title,
            detail: todo.detail,
            dueDate: todo.dueDate,
            partnerId: todo.partnerId,
            customerId: todo.customerId,
            opportunityId: todo.opportunityId,
            projectId: todo.projectId,
            assigneeId: todo.assigneeId,
          }}
          partners={partners}
          users={users}
        />
        <form action={deleteTodoAction.bind(null, todo.id)}>
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
}

export function DashboardOverdueTodoRow({
  todo,
  bcp47,
}: {
  todo: TodoRow;
  bcp47: string;
}) {
  const m = useMessages();
  const linkLabel = todoLinkLabel(todo, { opportunity: m.common.linkOpportunity, project: m.common.linkProject });

  return (
    <div className="flex items-start gap-2.5">
      <TodoCompleteButton
        todoId={todo.id}
        title={todo.title}
        status={todo.status}
        partnerId={todo.partnerId}
        customerId={todo.customerId}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-800">
          {todo.title}
          <TodoLinkTag label={linkLabel} />
        </div>
        <div className="text-xs text-red-500">
          {todo.dueDate && fmtDate(todo.dueDate, bcp47)} {m.common.overdue}
          {todo.partner && (
            <>
              {" · "}
              <Link href={`/partners/${todo.partner.id}`} className="text-sky-600 hover:underline">
                {todo.partner.name}
              </Link>
            </>
          )}
          {!todo.partner && todo.customer && (
            <>
              {" · "}
              <Link href={`/customers/${todo.customer.id}`} className="text-sky-600 hover:underline">
                {todo.customer.name}
              </Link>
            </>
          )}
          {todo.assignee && ` · ${todo.assignee.name}`}
        </div>
      </div>
    </div>
  );
}
