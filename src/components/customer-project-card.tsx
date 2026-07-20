"use client";

import { useState } from "react";
import { Badge, EmptyState, fmtDate } from "@/components/ui";
import { CustomerTodoRow } from "@/components/customer-todo-row";
import {
  upsertProjectAction,
  deleteProjectAction,
  createProjectWorkLogAction,
  deleteProjectWorkLogAction,
  createTodoAction,
} from "@/lib/actions";
import { useMessages, useLocale } from "@/lib/i18n/context";
import type { OwnerRef } from "@/lib/owner";
import { AmountInput } from "@/components/amount-input";
import { formatAmountDisplay } from "@/lib/amount";

type Option = { id: string; name: string; role?: string };

type ProjectTodo = {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  assignee: { name: string } | null;
};

type ProjectWorkLog = {
  id: string;
  content: string;
  createdAt: Date;
  author: { name: string };
};

export type CustomerProject = {
  id: string;
  name: string;
  phase: string;
  status: string;
  amount: string | null;
  currency: string | null;
  startDate: Date | null;
  endDate: Date | null;
  partnerId: string | null;
  partner: { id: string; name: string } | null;
  todos: ProjectTodo[];
  workLogs: ProjectWorkLog[];
};

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function CustomerProjectCard({
  project,
  owner,
  customerId,
  defaultAssigneeId,
  partners,
  users,
  bcp47,
}: {
  project: CustomerProject;
  owner: OwnerRef;
  customerId: string;
  defaultAssigneeId: string;
  partners: Option[];
  users: Option[];
  bcp47: string;
}) {
  const m = useMessages();
  const locale = useLocale();
  const c = m.customers;
  const [editing, setEditing] = useState(false);

  const total = project.todos.length;
  const done = project.todos.filter((t) => t.status === "DONE").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const phaseLabel = (p: string) =>
    (
      ({
        KICKOFF: c.phaseKICKOFF,
        IMPLEMENT: c.phaseIMPLEMENT,
        ACCEPTANCE: c.phaseACCEPTANCE,
        GOLIVE: c.phaseGOLIVE,
        MAINTENANCE: c.phaseMAINTENANCE,
      }) as Record<string, string>
    )[p] ?? p;

  const statusLabel = (s: string) =>
    (
      ({
        ACTIVE: c.projectStatusACTIVE,
        ON_HOLD: c.projectStatusON_HOLD,
        DONE: c.projectStatusDONE,
        CLOSED: c.projectStatusCLOSED,
      }) as Record<string, string>
    )[s] ?? s;

  const dateRange =
    [project.startDate ? fmtDate(project.startDate, bcp47) : null, project.endDate ? fmtDate(project.endDate, bcp47) : null]
      .filter(Boolean)
      .join(" – ") || "—";

  const infoFields: [string, string][] = [
    [m.common.amount, formatAmountDisplay(project.amount, project.currency, locale)],
    [m.projects.colPhase, phaseLabel(project.phase)],
    [m.projects.colStatus, statusLabel(project.status)],
    [m.projects.colDates, dateRange],
    [c.deliveryPartner, project.partner?.name ?? c.deliveryPartnerNone],
  ];

  return (
    <div className="rounded-lg border border-slate-100">
      <div className="px-4 py-3 border-b border-slate-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900">{project.name}</span>
          <Badge tone="blue">{phaseLabel(project.phase)}</Badge>
          <Badge tone={project.status === "ACTIVE" ? "green" : project.status === "DONE" ? "indigo" : "zinc"}>
            {statusLabel(project.status)}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-slate-400">
            {c.projectProgress}: {done}/{total}
          </span>
          {project.partner && (
            <span className="text-[11px] text-slate-400">
              · {c.deliveryPartner}: {project.partner.name}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <section>
          <div className="text-xs font-semibold text-slate-500 mb-2">{c.projectWorkLogs}</div>
          <form action={createProjectWorkLogAction.bind(null, owner)} className="mb-3">
            <input type="hidden" name="projectId" value={project.id} />
            <textarea
              name="content"
              required
              rows={3}
              placeholder={c.projectWorkLogPlaceholder}
              className={`${input} w-full resize-y`}
            />
            <div className="flex justify-end mt-2">
              <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700">
                {c.addWorkLog}
              </button>
            </div>
          </form>
          <div className="divide-y divide-slate-50">
            {project.workLogs.map((log) => (
              <div key={log.id} className="py-2.5 group">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap flex-1">{log.content}</p>
                  <form action={deleteProjectWorkLogAction.bind(null, owner, log.id)}>
                    <button className="text-xs text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 shrink-0">
                      {m.common.delete}
                    </button>
                  </form>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {log.author.name} · {fmtDate(log.createdAt, bcp47)}
                </div>
              </div>
            ))}
            {project.workLogs.length === 0 && <EmptyState text={c.noWorkLogs} />}
          </div>
        </section>

        <section className="border-t border-slate-50 pt-4">
          <div className="text-xs font-semibold text-slate-500 mb-2">{c.projectTodos}</div>
          <form action={createTodoAction} className="flex flex-wrap gap-2 mb-3">
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="projectId" value={project.id} />
            <input name="title" required placeholder={c.addTodoPlaceholder} className={`${input} flex-1 min-w-[140px]`} />
            <input name="dueDate" type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0" />
            <select
              name="assigneeId"
              defaultValue={defaultAssigneeId}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0 max-w-[140px]"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-700">+</button>
          </form>
          <div className="divide-y divide-slate-50">
            {project.todos.map((t) => (
              <CustomerTodoRow key={t.id} todo={t} customerId={customerId} bcp47={bcp47} />
            ))}
            {project.todos.length === 0 && <EmptyState text={c.noTodos} />}
          </div>
        </section>

        <section className="border-t border-slate-50 pt-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-slate-500">{c.projectInfo}</div>
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className="text-xs text-sky-600 hover:underline">
                {c.editProject}
              </button>
            )}
          </div>

          {!editing ? (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
              {infoFields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="mt-0.5 text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <form
              action={upsertProjectAction.bind(null, owner)}
              className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm"
              onSubmit={() => setEditing(false)}
            >
              <input type="hidden" name="id" value={project.id} />
              <input name="name" defaultValue={project.name} className={input} />
              <AmountInput
                inputClassName={input}
                amountPlaceholder={m.common.amount}
                amountAriaLabel={m.common.amount}
                currencyAriaLabel={m.common.currency}
                locale={locale}
                defaultAmount={project.amount}
                defaultCurrency={project.currency}
              />
              <select name="phase" defaultValue={project.phase} className={input}>
                <option value="KICKOFF">{c.phaseKICKOFF}</option>
                <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
                <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
                <option value="GOLIVE">{c.phaseGOLIVE}</option>
                <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
              </select>
              <select name="status" defaultValue={project.status} className={input}>
                <option value="ACTIVE">{c.projectStatusACTIVE}</option>
                <option value="ON_HOLD">{c.projectStatusON_HOLD}</option>
                <option value="DONE">{c.projectStatusDONE}</option>
                <option value="CLOSED">{c.projectStatusCLOSED}</option>
              </select>
              <input
                name="startDate"
                type="date"
                defaultValue={project.startDate ? new Date(project.startDate).toISOString().slice(0, 10) : ""}
                className={input}
                aria-label={c.projectStartDate}
              />
              <input
                name="endDate"
                type="date"
                defaultValue={project.endDate ? new Date(project.endDate).toISOString().slice(0, 10) : ""}
                className={input}
                aria-label={c.projectEndDate}
              />
              <select name="partnerId" defaultValue={project.partnerId ?? ""} className={`${input} md:col-span-3`}>
                <option value="">{c.deliveryPartnerNone}</option>
                {partners.map((pp) => (
                  <option key={pp.id} value={pp.id}>
                    {pp.name}
                  </option>
                ))}
              </select>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700">
                  {m.common.cancel}
                </button>
                <button formAction={deleteProjectAction.bind(null, owner, project.id)} className="text-xs text-slate-400 hover:text-red-600">
                  {m.common.delete}
                </button>
                <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.save}</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
