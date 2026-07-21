"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { monthLabel } from "@/lib/arr-calendar-types";
import {
  upsertArrCalendarCellAction,
  upsertArrCustomerProfileAction,
} from "@/lib/arr-calendar-actions";
import { createTodoAction } from "@/lib/actions";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { fmtDate } from "@/components/ui";

export type CalendarOpenTodo = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null; // ISO
  assigneeName: string | null;
};

export type CalendarRowData = {
  customerId: string;
  customerName: string;
  partnerNames: string[];
  ownerName: string | null;
  arr: number;
  latestService: string | null;
  situation: string;
  /** Legacy free-text from ArrCustomerProfile.todo (read-only hint). */
  legacyTodo: string;
  openTodos: CalendarOpenTodo[];
  cells: Record<number, { content: string }>;
};

type Copy = {
  colCustomer: string;
  colPartner: string;
  colArr: string;
  colLatestService: string;
  colOwner: string;
  colSituation: string;
  colTodo: string;
  save: string;
  saving: string;
  placeholderCell: string;
  placeholderSituation: string;
  placeholderTodo: string;
  addTodo: string;
  noOpenTodos: string;
  viewCustomerTodos: string;
  legacyTodoHint: string;
};

function formatArr(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function QuickAddTodo({
  customerId,
  placeholder,
  addLabel,
}: {
  customerId: string;
  placeholder: string;
  addLabel: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-1 mt-1"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t || pending) return;
        const fd = new FormData();
        fd.set("title", t);
        fd.set("customerId", customerId);
        startTransition(async () => {
          await createTodoAction(fd);
          setTitle("");
          router.refresh();
        });
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        disabled={pending}
        className="flex-1 min-w-0 rounded border border-slate-200 px-1.5 py-1 text-[11px] outline-none focus:border-sky-300"
      />
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="shrink-0 rounded bg-slate-900 text-white px-1.5 py-1 text-[10px] disabled:opacity-40"
      >
        {addLabel}
      </button>
    </form>
  );
}

export function ArrCalendarTable({
  year,
  months,
  rows: initialRows,
  locale,
  bcp47,
  copy,
}: {
  year: number;
  months: number[];
  rows: CalendarRowData[];
  locale: "zh" | "en";
  bcp47: string;
  copy: Copy;
}) {
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{
    customerId: string;
    month: number;
    content: string;
  } | null>(null);
  const [profileEdit, setProfileEdit] = useState<{
    customerId: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const monthHeaders = useMemo(
    () => months.map((m) => ({ month: m, label: monthLabel(m, locale) })),
    [months, locale]
  );

  const saveCell = useCallback(() => {
    if (!editing) return;
    const { customerId, month, content } = editing;
    setRows((prev) =>
      prev.map((r) => {
        if (r.customerId !== customerId) return r;
        const nextCells = { ...r.cells };
        if (!content.trim()) delete nextCells[month];
        else nextCells[month] = { content: content.trim() };
        return { ...r, cells: nextCells };
      })
    );
    setEditing(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("year", String(year));
      fd.set("month", String(month));
      fd.set("content", content);
      fd.set("kind", "NOTE");
      await upsertArrCalendarCellAction(fd);
    });
  }, [editing, year]);

  const saveSituation = useCallback(() => {
    if (!profileEdit) return;
    const { customerId, value } = profileEdit;
    setRows((prev) =>
      prev.map((r) => (r.customerId === customerId ? { ...r, situation: value } : r))
    );
    setProfileEdit(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("situation", value);
      await upsertArrCustomerProfileAction(fd);
    });
  }, [profileEdit]);

  return (
    <div className="relative">
      {pending && (
        <div className="absolute right-2 top-2 z-10 text-[11px] text-slate-400 bg-white/90 px-2 py-0.5 rounded border border-slate-100">
          {copy.saving}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white shadow-sm">
        <table className="w-full text-sm border-collapse min-w-[1400px]">
          <thead>
            <tr className="bg-slate-50/80 text-left text-xs text-slate-500">
              <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2.5 font-medium min-w-[160px] border-b border-r border-slate-200">
                {copy.colCustomer}
              </th>
              <th className="px-2 py-2.5 font-medium min-w-[100px] border-b border-slate-200">
                {copy.colPartner}
              </th>
              <th className="px-2 py-2.5 font-medium min-w-[72px] border-b border-slate-200 text-right">
                {copy.colArr}
              </th>
              <th className="px-2 py-2.5 font-medium min-w-[100px] border-b border-slate-200">
                {copy.colLatestService}
              </th>
              <th className="px-2 py-2.5 font-medium min-w-[100px] border-b border-slate-200">
                {copy.colOwner}
              </th>
              <th className="px-2 py-2.5 font-medium min-w-[180px] border-b border-slate-200">
                {copy.colSituation}
              </th>
              <th className="px-2 py-2.5 font-medium min-w-[200px] border-b border-slate-200">
                {copy.colTodo}
              </th>
              {monthHeaders.map((h) => (
                <th
                  key={h.month}
                  className="px-2 py-2.5 font-medium min-w-[140px] border-b border-slate-200 text-center"
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.customerId} className="align-top border-b border-slate-100 hover:bg-slate-50/40">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-100">
                  <Link
                    href={`/customers/${row.customerId}?tab=contracts`}
                    className="font-medium text-sky-700 hover:underline"
                  >
                    {row.customerName}
                  </Link>
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {row.partnerNames.length ? row.partnerNames.join("、") : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-700 font-medium">
                  {formatArr(row.arr)}
                </td>
                <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap">
                  {row.latestService || "—"}
                </td>
                <td className="px-2 py-2 text-xs text-slate-600">{row.ownerName ?? "—"}</td>
                <td className="px-2 py-2">
                  {profileEdit?.customerId === row.customerId ? (
                    <textarea
                      autoFocus
                      value={profileEdit.value}
                      onChange={(e) => setProfileEdit({ ...profileEdit, value: e.target.value })}
                      onBlur={saveSituation}
                      rows={3}
                      className="w-full rounded border border-sky-300 px-2 py-1 text-xs resize-y"
                      placeholder={copy.placeholderSituation}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setProfileEdit({
                          customerId: row.customerId,
                          value: row.situation,
                        })
                      }
                      className="w-full text-left text-xs text-slate-600 whitespace-pre-wrap min-h-[2.5rem] hover:bg-slate-50 rounded px-1 -mx-1"
                    >
                      {row.situation || (
                        <span className="text-slate-300">{copy.placeholderSituation}</span>
                      )}
                    </button>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="space-y-1.5 min-w-[11rem]">
                    {row.openTodos.length === 0 && row.legacyTodo ? (
                      <p className="text-[10px] text-slate-400 leading-snug whitespace-pre-wrap">
                        <span className="text-slate-300">{copy.legacyTodoHint} </span>
                        {row.legacyTodo}
                      </p>
                    ) : null}
                    {row.openTodos.length === 0 && !row.legacyTodo ? (
                      <p className="text-[10px] text-slate-300">{copy.noOpenTodos}</p>
                    ) : null}
                    <ul className="space-y-1">
                      {row.openTodos.map((todo) => (
                        <li key={todo.id} className="flex items-start gap-1.5">
                          <TodoCompleteButton
                            todoId={todo.id}
                            title={todo.title}
                            status={todo.status}
                            customerId={row.customerId}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-slate-800 leading-snug line-clamp-2">
                              {todo.title}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {todo.dueDate ? fmtDate(todo.dueDate, bcp47) : null}
                              {todo.dueDate && todo.assigneeName ? " · " : null}
                              {todo.assigneeName}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <QuickAddTodo
                      customerId={row.customerId}
                      placeholder={copy.placeholderTodo}
                      addLabel={copy.addTodo}
                    />
                    <Link
                      href={`/customers/${row.customerId}?tab=overview`}
                      className="block text-[10px] text-sky-600 hover:underline"
                    >
                      {copy.viewCustomerTodos}
                    </Link>
                  </div>
                </td>
                {months.map((month) => {
                  const cell = row.cells[month];
                  const isEditing =
                    editing?.customerId === row.customerId && editing.month === month;
                  if (isEditing && editing) {
                    return (
                      <td key={month} className="px-1 py-1">
                        <div className="rounded border border-sky-300 bg-white p-1 space-y-1">
                          <textarea
                            autoFocus
                            value={editing.content}
                            onChange={(e) =>
                              setEditing({ ...editing, content: e.target.value })
                            }
                            rows={3}
                            className="w-full text-xs px-1 py-0.5 resize-y outline-none"
                            placeholder={copy.placeholderCell}
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={saveCell}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white"
                            >
                              {copy.save}
                            </button>
                          </div>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={month} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            customerId: row.customerId,
                            month,
                            content: cell?.content ?? "",
                          })
                        }
                        className={`w-full min-h-[3.5rem] rounded border px-1.5 py-1 text-left text-[11px] whitespace-pre-wrap leading-snug ${
                          cell
                            ? "bg-white border-slate-100"
                            : "bg-slate-50/50 border-transparent hover:border-slate-200 hover:bg-white"
                        }`}
                      >
                        {cell?.content || (
                          <span className="text-slate-300">{copy.placeholderCell}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
