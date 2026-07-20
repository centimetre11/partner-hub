"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
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

export type CalendarRowData = {
  customerId: string;
  customerName: string;
  partnerNames: string[];
  ownerName: string | null;
  arr: number;
  latestService: string | null; // ISO date or empty
  situation: string;
  todo: string;
  cells: Record<number, { content: string; kind: ArrCalendarKind }>;
};

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
};

function formatArr(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function ArrCalendarTable({
  year,
  months,
  rows: initialRows,
  locale,
  copy,
}: {
  year: number;
  months: number[];
  rows: CalendarRowData[];
  locale: "zh" | "en";
  copy: Copy;
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
    field: "situation" | "todo";
    value: string;
  } | null>(null);

  const monthHeaders = useMemo(
    () => months.map((m) => ({ month: m, label: monthLabel(m, locale) })),
    [months, locale]
  );

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
              <th className="px-2 py-2.5 font-medium min-w-[120px] border-b border-slate-200">
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
                  {profileEdit?.customerId === row.customerId && profileEdit.field === "todo" ? (
                    <textarea
                      autoFocus
                      value={profileEdit.value}
                      onChange={(e) => setProfileEdit({ ...profileEdit, value: e.target.value })}
                      onBlur={saveProfile}
                      rows={2}
                      className="w-full rounded border border-sky-300 px-2 py-1 text-xs resize-y"
                      placeholder={copy.placeholderTodo}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setProfileEdit({
                          customerId: row.customerId,
                          field: "todo",
                          value: row.todo,
                        })
                      }
                      className="w-full text-left text-xs text-slate-600 whitespace-pre-wrap min-h-[2rem] hover:bg-slate-50 rounded px-1 -mx-1"
                    >
                      {row.todo || <span className="text-slate-300">{copy.placeholderTodo}</span>}
                    </button>
                  )}
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
                    <td key={month} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            customerId: row.customerId,
                            month,
                            content: cell?.content ?? "",
                            kind: cell?.kind ?? "NOTE",
                          })
                        }
                        className={`w-full min-h-[3.5rem] rounded border px-1.5 py-1 text-left text-[11px] whitespace-pre-wrap leading-snug ${
                          cell
                            ? arrCalendarKindCellClass(cell.kind)
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
