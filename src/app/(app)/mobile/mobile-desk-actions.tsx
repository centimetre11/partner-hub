"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createTodoAction } from "@/lib/actions";

type Option = { id: string; name: string };

type TodoCaptureLabels = {
  button: string;
  title: string;
  todoTitle: string;
  titlePlaceholder: string;
  partner: string;
  noPartner: string;
  owner: string;
  dueDate: string;
  priority: string;
  notes: string;
  optional: string;
  cancel: string;
  submit: string;
  saving: string;
  high: string;
  medium: string;
  low: string;
};

const input =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function MobileTodoCapture({
  userId,
  partners,
  users,
  labels,
}: {
  userId: string;
  partners: Option[];
  users: Option[];
  labels: TodoCaptureLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {labels.button}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={labels.cancel}
            className="fixed inset-0 z-40 bg-slate-950/40"
            onClick={() => !saving && setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="mobile-todo-capture-title"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] border border-slate-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:top-4 sm:h-auto sm:w-[24rem] sm:rounded-[1.75rem]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="mobile-todo-capture-title" className="text-base font-semibold text-slate-900">
                {labels.title}
              </h2>
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="rounded-full px-2 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
                aria-label={labels.cancel}
              >
                x
              </button>
            </div>

            <form
              className="space-y-3"
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
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{labels.todoTitle}</span>
                <input name="title" required autoFocus placeholder={labels.titlePlaceholder} className={input} />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{labels.partner}</span>
                <select name="partnerId" defaultValue="" className={input}>
                  <option value="">{labels.noPartner}</option>
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{labels.owner}</span>
                <select name="assigneeId" defaultValue={userId} className={input}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">{labels.dueDate}</span>
                  <input name="dueDate" type="date" className={input} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">{labels.priority}</span>
                  <select name="priority" defaultValue="MEDIUM" className={input}>
                    <option value="HIGH">{labels.high}</option>
                    <option value="MEDIUM">{labels.medium}</option>
                    <option value="LOW">{labels.low}</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">{labels.notes}</span>
                <input name="detail" placeholder={labels.optional} className={input} />
              </label>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {labels.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? labels.saving : labels.submit}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
