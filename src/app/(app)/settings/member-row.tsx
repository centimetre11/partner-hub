"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import type { User } from "@prisma/client";
import { updateUserAction } from "@/lib/actions";
import { saveUserIdentityByAdminAction } from "@/lib/user-identity-actions";
import { USER_ROLES, USER_ROLE_LABELS, normalizeUserRole } from "@/lib/user-roles";
import { fmtDate } from "@/components/ui";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

type MemberUser = User & {
  wecomUserId: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
};

function EditMemberForm({ user, salesmen, onClose }: { user: MemberUser; salesmen: string[]; onClose: () => void }) {
  const role = normalizeUserRole(user.role);
  const [state, action, pending] = useActionState(
    async (_: unknown, formData: FormData) => updateUserAction(user.id, formData),
    null,
  );
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityPending, startIdentity] = useTransition();

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  function saveIdentity(formData: FormData) {
    startIdentity(async () => {
      setIdentityError(null);
      const res = await saveUserIdentityByAdminAction(user.id, formData);
      if ("error" in res && res.error) setIdentityError(res.error);
      else onClose();
    });
  }

  return (
    <div className="space-y-6 text-sm max-h-[70vh] overflow-y-auto">
      <form action={action} className="space-y-3">
        <h4 className="text-xs font-semibold text-zinc-500 uppercase">基本资料</h4>
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
            {pending ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>

      <form action={saveIdentity} className="space-y-3 border-t border-zinc-100 pt-4">
        <h4 className="text-xs font-semibold text-zinc-500 uppercase">身份绑定（企微 · CRM）</h4>
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">企微 userid</span>
          <input name="wecomUserId" defaultValue={user.wecomUserId ?? ""} placeholder="Kyle" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">企微显示名（可选）</span>
          <input name="wecomDisplayName" defaultValue={user.wecomDisplayName ?? ""} placeholder="saber-陈敏" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">CRM 销售英文名</span>
          {salesmen.length ? (
            <select name="crmSalesmanName" defaultValue={user.crmSalesmanName ?? ""} className={input}>
              <option value="">（未绑定）</option>
              {salesmen.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <input name="crmSalesmanName" defaultValue={user.crmSalesmanName ?? ""} placeholder="Fay.Wen" className={input} />
          )}
        </label>
        {identityError && <p className="text-xs text-red-600">{identityError}</p>}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={identityPending}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {identityPending ? "Saving…" : "Save identity bindings"}
          </button>
        </div>
      </form>
    </div>
  );
}

function bindingBadge(label: string, ok: boolean) {
  return (
    <span className={`text-[10px] rounded px-1.5 py-0.5 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-400"}`}>
      {label}
    </span>
  );
}

export function MemberRow({ user, salesmen }: { user: MemberUser; salesmen: string[] }) {
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
            {bindingBadge("企微", !!user.wecomUserId)}
            {bindingBadge("CRM", !!user.crmSalesmanName)}
          </div>
          <div className="text-xs text-zinc-400">
            {user.email} · Joined {fmtDate(user.createdAt)}
            {user.wecomUserId ? ` · WeCom ${user.wecomUserId}` : ""}
            {user.crmSalesmanName ? ` · CRM ${user.crmSalesmanName}` : ""}
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
            <EditMemberForm user={user} salesmen={salesmen} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
