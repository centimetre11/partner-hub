"use client";

import { useState } from "react";
import { updateTodoAction } from "@/lib/actions";

type TodoData = {
  id: string;
  title: string;
  detail?: string | null;
  dueDate?: Date | string | null;
  partnerId?: string | null;
  assigneeId?: string | null;
};

type Option = { id: string; name: string };

function toDateInput(d?: Date | string | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
}

export function TodoEditButton({
  todo,
  partners,
  users,
}: {
  todo: TodoData;
  partners?: Option[];
  users: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const input =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 w-full";

  return (
    <>
      <button
        type="button"
        title="Edit todo"
        onClick={() => setOpen(true)}
        className="text-slate-300 hover:text-slate-500 text-sm opacity-60 group-hover:opacity-100"
      >
        ✎
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Edit todo</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <form
              action={async (formData) => {
                setSaving(true);
                try {
                  await updateTodoAction(todo.id, formData);
                  setOpen(false);
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs text-slate-500">Title</label>
                <input name="title" required defaultValue={todo.title} className={input} />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Notes</label>
                <input
                  name="detail"
                  defaultValue={todo.detail ?? ""}
                  placeholder="Optional"
                  className={input}
                />
              </div>

              {partners && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Partner</label>
                  <select name="partnerId" defaultValue={todo.partnerId ?? ""} className={input}>
                    <option value="">No partner</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-500">Assignee</label>
                <select name="assigneeId" defaultValue={todo.assigneeId ?? ""} className={input}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Due date</label>
                <input
                  name="dueDate"
                  type="date"
                  defaultValue={toDateInput(todo.dueDate)}
                  className={input}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
