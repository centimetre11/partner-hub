"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ARR_CALENDAR_KIND_CODES,
  arrCalendarKindCellClass,
  arrCalendarKindLabel,
  monthLabel,
  type ArrCalendarKind,
} from "@/lib/arr-calendar-types";
import {
  upsertArrCalendarCellAction,
  upsertArrCustomerProfileAction,
} from "@/lib/arr-calendar-actions";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { CreateBusinessRecordDrawer } from "@/components/create-business-record-drawer";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";

export type CalendarOpenTodo = {
  id: string;
  title: string;
  dueDate: string | null; // ISO or display
};

export type CalendarRowData = {
  customerId: string;
  customerName: string;
  partnerNames: string[];
  ownerName: string | null;
  arr: number;
  latestService: string | null; // ISO date or empty
  situation: string;
  /** Legacy free-text focus note (shown under open todos when present). */
  todo: string;
  openTodos: CalendarOpenTodo[];
  cells: Record<number, { content: string; kind: ArrCalendarKind }>;
};

type Option = { id: string; name: string };

type Copy = {
  colCustomer: string;
  colPartner: string;
  colArr: string;
  colLatestService: string;
  colOwner: string;
  colSituation: string;
  colTodo: string;
  kindLabel: string;
  save: string;
  saving: string;
  placeholderCell: string;
  placeholderSituation: string;
  placeholderTodo: string;
  actionEdit: string;
  actionAddTodo: string;
  actionLogRecord: string;
  actionOpenCustomer: string;
  openTodosEmpty: string;
  addTodoForCustomer: string;
  todoDuePrefix: string;
  createdHint: string;
  primaryFollowUp: string;
  primaryInspection: string;
};

function formatArr(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Last calendar day of year-month as YYYY-MM-DD (local). */
export function lastDayOfMonthIso(year: number, month: number): string {
  const d = new Date(year, month, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cellKey(customerId: string, month: number) {
  return `${customerId}:${month}`;
}

type CellMenu = {
  customerId: string;
  customerName: string;
  month: number;
  content: string;
  kind: ArrCalendarKind;
};

type TodoDraft = {
  customerId: string;
  title: string;
  dueDate: string;
  detail: string;
  month?: number;
};

type RecordDraft = {
  customerId: string;
  title: string;
  month?: number;
};

export function ArrCalendarTable({
  year,
  months,
  rows: initialRows,
  locale,
  copy,
  userId,
  partners,
  customers,
  users,
}: {
  year: number;
  months: number[];
  rows: CalendarRowData[];
  locale: "zh" | "en";
  copy: Copy;
  userId: string;
  partners: Option[];
  customers: Option[];
  users: Option[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{
    customerId: string;
    month: number;
    content: string;
    kind: ArrCalendarKind;
  } | null>(null);
  const [profileEdit, setProfileEdit] = useState<{
    customerId: string;
    field: "situation";
    value: string;
  } | null>(null);
  const [cellMenu, setCellMenu] = useState<CellMenu | null>(null);
  const [todoDraft, setTodoDraft] = useState<TodoDraft | null>(null);
  const [recordDraft, setRecordDraft] = useState<RecordDraft | null>(null);
  const [flashKeys, setFlashKeys] = useState<Record<string, true>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (!cellMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCellMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCellMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [cellMenu]);

  const monthHeaders = useMemo(
    () => months.map((m) => ({ month: m, label: monthLabel(m, locale) })),
    [months, locale]
  );

  const markFlash = useCallback((customerId: string, month?: number) => {
    if (month == null) return;
    const key = cellKey(customerId, month);
    setFlashKeys((prev) => ({ ...prev, [key]: true }));
    window.setTimeout(() => {
      setFlashKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2500);
  }, []);

  const saveCell = useCallback(() => {
    if (!editing) return;
    const { customerId, month, content, kind } = editing;
    setRows((prev) =>
      prev.map((r) => {
        if (r.customerId !== customerId) return r;
        const nextCells = { ...r.cells };
        if (!content.trim()) delete nextCells[month];
        else nextCells[month] = { content: content.trim(), kind };
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
      fd.set("kind", kind);
      await upsertArrCalendarCellAction(fd);
    });
  }, [editing, year]);

  const saveProfile = useCallback(() => {
    if (!profileEdit) return;
    const { customerId, field, value } = profileEdit;
    setRows((prev) =>
      prev.map((r) => (r.customerId === customerId ? { ...r, [field]: value } : r))
    );
    setProfileEdit(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set(field, value);
      await upsertArrCustomerProfileAction(fd);
    });
  }, [profileEdit]);

  function openTodoFromCell(menu: CellMenu) {
    const dueDate = lastDayOfMonthIso(year, menu.month);
    const title =
      menu.content.trim() ||
      `${arrCalendarKindLabel(menu.kind, locale)} · ${menu.customerName} · ${monthLabel(menu.month, locale)}`;
    setCellMenu(null);
    setTodoDraft({
      customerId: menu.customerId,
      title,
      dueDate,
      detail: `${year}-${String(menu.month).padStart(2, "0")} ARR calendar`,
      month: menu.month,
    });
  }

  function openRecordFromCell(menu: CellMenu) {
    const title =
      menu.content.trim() ||
      `${arrCalendarKindLabel(menu.kind, locale)} · ${menu.customerName} · ${monthLabel(menu.month, locale)}`;
    setCellMenu(null);
    setRecordDraft({
      customerId: menu.customerId,
      title,
      month: menu.month,
    });
  }

  function primaryAction(kind: ArrCalendarKind): "todo" | "record" {
    if (kind === "INSPECTION") return "record";
    return "todo";
  }

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
              <th className="px-2 py-2.5 font-medium min-w-[160px] border-b border-slate-200">
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
                    href={`/customers/${row.customerId}?tab=arr`}
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
                  {profileEdit?.customerId === row.customerId && profileEdit.field === "situation" ? (
                    <div className="space-y-1">
                      <textarea
                        autoFocus
                        value={profileEdit.value}
                        onChange={(e) => setProfileEdit({ ...profileEdit, value: e.target.value })}
                        onBlur={saveProfile}
                        rows={3}
                        className="w-full rounded border border-sky-300 px-2 py-1 text-xs resize-y"
                        placeholder={copy.placeholderSituation}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setProfileEdit({
                          customerId: row.customerId,
                          field: "situation",
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
                  <div className="space-y-1.5">
                    {row.openTodos.length === 0 ? (
                      <p className="text-[11px] text-slate-300">{copy.openTodosEmpty}</p>
                    ) : (
                      <ul className="space-y-1">
                        {row.openTodos.slice(0, 4).map((t) => (
                          <li key={t.id} className="text-[11px] text-slate-700 leading-snug">
                            <span className="line-clamp-2">{t.title}</span>
                            {t.dueDate && (
                              <span className="block text-[10px] text-slate-400">
                                {copy.todoDuePrefix} {t.dueDate}
                              </span>
                            )}
                          </li>
                        ))}
                        {row.openTodos.length > 4 && (
                          <li className="text-[10px] text-slate-400">+{row.openTodos.length - 4}</li>
                        )}
                      </ul>
                    )}
                    {row.todo ? (
                      <p className="text-[10px] text-slate-400 whitespace-pre-wrap border-t border-slate-100 pt-1">
                        {row.todo}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setTodoDraft({
                          customerId: row.customerId,
                          title: "",
                          dueDate: "",
                          detail: "",
                        })
                      }
                      className="text-[11px] font-medium text-sky-700 hover:underline"
                    >
                      {copy.addTodoForCustomer}
                    </button>
                  </div>
                </td>
                {months.map((month) => {
                  const cell = row.cells[month];
                  const isEditing =
                    editing?.customerId === row.customerId && editing.month === month;
                  const flashed = !!flashKeys[cellKey(row.customerId, month)];
                  const menuOpen =
                    cellMenu?.customerId === row.customerId && cellMenu.month === month;

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
                          <div className="flex items-center gap-1">
                            <select
                              value={editing.kind}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  kind: e.target.value as ArrCalendarKind,
                                })
                              }
                              className="flex-1 text-[10px] border border-slate-200 rounded px-1 py-0.5"
                              aria-label={copy.kindLabel}
                            >
                              {ARR_CALENDAR_KIND_CODES.map((k) => (
                                <option key={k} value={k}>
                                  {arrCalendarKindLabel(k, locale)}
                                </option>
                              ))}
                            </select>
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
                    <td key={month} className="px-1 py-1 relative">
                      <button
                        type="button"
                        onClick={() =>
                          setCellMenu({
                            customerId: row.customerId,
                            customerName: row.customerName,
                            month,
                            content: cell?.content ?? "",
                            kind: cell?.kind ?? "NOTE",
                          })
                        }
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          setCellMenu(null);
                          setEditing({
                            customerId: row.customerId,
                            month,
                            content: cell?.content ?? "",
                            kind: cell?.kind ?? "NOTE",
                          });
                        }}
                        className={`w-full min-h-[3.5rem] rounded border px-1.5 py-1 text-left text-[11px] whitespace-pre-wrap leading-snug transition-shadow ${
                          cell
                            ? arrCalendarKindCellClass(cell.kind)
                            : "bg-slate-50/50 border-transparent hover:border-slate-200 hover:bg-white"
                        } ${flashed ? "ring-2 ring-emerald-400 shadow-sm" : ""} ${
                          menuOpen ? "ring-2 ring-sky-400" : ""
                        }`}
                      >
                        {cell?.content || (
                          <span className="text-slate-300">{copy.placeholderCell}</span>
                        )}
                        {flashed && (
                          <span className="mt-1 block text-[10px] font-medium text-emerald-700">
                            {copy.createdHint}
                          </span>
                        )}
                      </button>

                      {menuOpen && cellMenu && (
                        <div
                          ref={menuRef}
                          className="absolute left-1 right-1 top-full z-30 mt-0.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                        >
                          {(() => {
                            const primary = primaryAction(cellMenu.kind);
                            const todoLabel =
                              cellMenu.kind === "FOLLOW_UP"
                                ? copy.primaryFollowUp
                                : copy.actionAddTodo;
                            const recordLabel =
                              cellMenu.kind === "INSPECTION"
                                ? copy.primaryInspection
                                : copy.actionLogRecord;
                            return (
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    primary === "todo"
                                      ? openTodoFromCell(cellMenu)
                                      : openRecordFromCell(cellMenu)
                                  }
                                  className="rounded px-2 py-1.5 text-left text-[11px] font-medium text-white bg-slate-900 hover:bg-slate-800"
                                >
                                  {primary === "todo" ? todoLabel : recordLabel}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    primary === "todo"
                                      ? openRecordFromCell(cellMenu)
                                      : openTodoFromCell(cellMenu)
                                  }
                                  className="rounded px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
                                >
                                  {primary === "todo" ? recordLabel : todoLabel}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditing({
                                      customerId: cellMenu.customerId,
                                      month: cellMenu.month,
                                      content: cellMenu.content,
                                      kind: cellMenu.kind,
                                    });
                                    setCellMenu(null);
                                  }}
                                  className="rounded px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
                                >
                                  {copy.actionEdit}
                                </button>
                                <Link
                                  href={`/customers/${cellMenu.customerId}?tab=arr`}
                                  className="rounded px-2 py-1.5 text-left text-[11px] text-sky-700 hover:bg-sky-50"
                                  onClick={() => setCellMenu(null)}
                                >
                                  {copy.actionOpenCustomer}
                                </Link>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateTodoDrawer
        userId={userId}
        partners={partners}
        customers={customers}
        users={users}
        showTrigger={false}
        lockOwner
        open={!!todoDraft}
        onOpenChange={(next) => {
          if (!next) setTodoDraft(null);
        }}
        defaultOwnerRef={
          todoDraft ? encodeTodoOwnerRef("customer", todoDraft.customerId) : ""
        }
        defaultTitle={todoDraft?.title ?? ""}
        defaultDueDate={todoDraft?.dueDate ?? ""}
        defaultDetail={todoDraft?.detail ?? ""}
        source="ARR_CALENDAR"
        onCreated={() => {
          if (todoDraft) markFlash(todoDraft.customerId, todoDraft.month);
        }}
      />

      <CreateBusinessRecordDrawer
        partners={partners}
        customers={customers}
        showTrigger={false}
        lockOwner
        open={!!recordDraft}
        onOpenChange={(next) => {
          if (!next) setRecordDraft(null);
        }}
        defaultOwnerRef={
          recordDraft ? encodeTodoOwnerRef("customer", recordDraft.customerId) : ""
        }
        defaultTitle={recordDraft?.title ?? ""}
        onCreated={() => {
          if (recordDraft) markFlash(recordDraft.customerId, recordDraft.month);
        }}
      />
    </div>
  );
}
