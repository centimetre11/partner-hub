"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createTodoAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";

type Option = { id: string; name: string };

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function CreateTodoDrawer({
  userId,
  partners,
  users,
}: {
  userId: string;
  partners: Option[];
  users: Option[];
}) {
  const m = useMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, saving]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 shrink-0"
      >
        + {m.dashboard.createTodo}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/25 z-40"
            onClick={() => !saving && setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="create-todo-title"
            className="fixed right-0 top-0 z-50 flex h-full w-[min(22rem,92vw)] flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h2 id="create-todo-title" className="text-sm font-semibold text-zinc-900">
                {m.dashboard.createTodo}
              </h2>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 text-lg leading-none"
                aria-label={m.common.cancel}
              >
                ×
              </button>
            </div>

            <form
              className="flex flex-1 flex-col overflow-y-auto p-4"
              action={async (formData) => {
                setSaving(true);
                try {
                  await createTodoAction(formData);
                  setOpen(false);
                  router.refresh();
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div className="space-y-3 text-sm flex-1">
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">{m.todos.fieldTitle}</span>
                  <input
                    name="title"
                    required
                    autoFocus
                    placeholder={m.partnerDetail.addTodoPlaceholder}
                    className={input}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">{m.todos.fieldPartner}</span>
                  <select name="partnerId" className={input} defaultValue="">
                    <option value="">{m.todos.noPartner}</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">{m.common.owner}</span>
                  <select name="assigneeId" className={input} defaultValue={userId}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-3">
                  <label className="block flex-1">
                    <span className="mb-1 block text-xs text-zinc-500">{m.todos.fieldDueDate}</span>
                    <input name="dueDate" type="date" className={input} />
                  </label>
                  <label className="block w-28">
                    <span className="mb-1 block text-xs text-zinc-500">{m.todos.fieldPriority}</span>
                    <select name="priority" className={input} defaultValue="MEDIUM">
                      <option value="HIGH">{m.common.high}</option>
                      <option value="MEDIUM">{m.common.medium}</option>
                      <option value="LOW">{m.common.low}</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-500">{m.todos.fieldNotes}</span>
                  <input name="detail" placeholder={m.todos.fieldNotesOptional} className={input} />
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {m.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? m.intakePanel.saving : m.dashboard.createTodo}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
