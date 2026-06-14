"use client";

import { useState } from "react";
import { updateTodoAction } from "@/lib/actions";

type TodoData = {
  id: string;
  title: string;
  detail?: string | null;
  dueDate?: Date | string | null;
  priority: string;
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
    "rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full";

  return (
    <>
      <button
        type="button"
        title="编辑待办"
        onClick={() => setOpen(true)}
        className="text-zinc-300 hover:text-indigo-500 text-sm transition-colors opacity-60 group-hover:opacity-100"
      >
        ✎
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800">编辑待办</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
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
                <label className="mb-1 block text-xs text-zinc-500">标题</label>
                <input name="title" required defaultValue={todo.title} className={input} />
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">备注</label>
                <input
                  name="detail"
                  defaultValue={todo.detail ?? ""}
                  placeholder="可选"
                  className={input}
                />
              </div>

              {partners && (
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">关联伙伴</label>
                  <select name="partnerId" defaultValue={todo.partnerId ?? ""} className={input}>
                    <option value="">不关联伙伴</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-zinc-500">负责人</label>
                  <select name="assigneeId" defaultValue={todo.assigneeId ?? ""} className={input}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-xs text-zinc-500">优先级</label>
                  <select name="priority" defaultValue={todo.priority} className={input}>
                    <option value="HIGH">高</option>
                    <option value="MEDIUM">中</option>
                    <option value="LOW">低</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">截止日期</label>
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
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
