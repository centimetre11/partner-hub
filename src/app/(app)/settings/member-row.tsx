"use client";

import { useState, useActionState, useEffect } from "react";
import type { User } from "@prisma/client";
import { updateUserAction } from "@/lib/actions";
import { USER_ROLES, USER_ROLE_LABELS, normalizeUserRole } from "@/lib/user-roles";
import { fmtDate } from "@/components/ui";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function EditMemberForm({ user, onClose }: { user: User; onClose: () => void }) {
  const role = normalizeUserRole(user.role);
  const [state, action, pending] = useActionState(
    async (_: unknown, formData: FormData) => updateUserAction(user.id, formData),
    null,
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-3 text-sm">
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Name</span>
        <input name="name" required defaultValue={user.name} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Email</span>
        <input name="email" type="email" required defaultValue={user.email} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Position</span>
        <select name="role" defaultValue={role} className={input}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">New password (optional, min. 6 characters)</span>
        <input name="password" type="password" minLength={6} placeholder="Leave blank to keep current" className={input} />
      </label>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
          Cancel
        </button>
        <button disabled={pending} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function MemberRow({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const role = normalizeUserRole(user.role);

  return (
    <>
      <div className="flex items-center gap-3 group">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
          {user.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-800">{user.name}</span>
            <span className="text-xs rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5">{USER_ROLE_LABELS[role]}</span>
          </div>
          <div className="text-xs text-zinc-400">
            {user.email} · Joined {fmtDate(user.createdAt)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-indigo-600 hover:underline shrink-0"
        >
          Edit
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">Edit member — {user.name}</h3>
            <EditMemberForm user={user} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
