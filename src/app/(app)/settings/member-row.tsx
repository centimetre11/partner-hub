"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import type { User } from "@prisma/client";
import { updateUserAction } from "@/lib/actions";
import { saveUserIdentityByAdminAction } from "@/lib/user-identity-actions";
import { USER_ROLES, USER_ROLE_LABELS, normalizeUserRole } from "@/lib/user-roles";
import { fmtDate } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

type MemberUser = User & {
  wecomUserId: string | null;
  wecomDisplayName: string | null;
  crmSalesmanName: string | null;
};

function EditMemberForm({ user, salesmen, onClose }: { user: MemberUser; salesmen: string[]; onClose: () => void }) {
  const m = useMessages();
  const { settings: s, account: a, identity: id, wecom: w, crm, common } = m;
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
        <h4 className="text-xs font-semibold text-slate-500 uppercase">{s.memberProfile}</h4>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{a.displayName}</span>
          <input name="name" required defaultValue={user.name} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{a.email}</span>
          <input name="email" type="email" required defaultValue={user.email} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{s.memberRole}</span>
          <select name="role" defaultValue={role} className={input}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{a.newPassword}</span>
          <input
            name="password"
            type="password"
            minLength={6}
            placeholder={a.newPassword}
            className={input}
          />
        </label>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
            {common.cancel}
          </button>
          <button disabled={pending} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
            {pending ? s.saving : s.saveProfile}
          </button>
        </div>
      </form>

      <form action={saveIdentity} className="space-y-3 border-t border-slate-100 pt-4">
        <h4 className="text-xs font-semibold text-slate-500 uppercase">{s.memberIdentity}</h4>
        <p className="text-xs text-slate-500 leading-relaxed">{id.desc}</p>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{w.userIdLabel}</span>
          <input
            name="wecomUserId"
            defaultValue={user.wecomUserId ?? ""}
            placeholder={w.userIdPlaceholder}
            className={input}
          />
          <span className="text-[11px] text-slate-400">{w.userIdHint}</span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{id.displayNameLabel}</span>
          <input
            name="wecomDisplayName"
            defaultValue={user.wecomDisplayName ?? ""}
            placeholder={id.displayNamePlaceholder}
            className={input}
          />
          <span className="text-[11px] text-slate-400">{id.displayNameHint}</span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{a.crmTitle}</span>
          {salesmen.length ? (
            <select name="crmSalesmanName" defaultValue={user.crmSalesmanName ?? ""} className={input}>
              <option value="">{crm.noMapping}</option>
              {salesmen.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : (
            <input
              name="crmSalesmanName"
              defaultValue={user.crmSalesmanName ?? ""}
              placeholder="Fay.Wen"
              className={input}
            />
          )}
        </label>
        {identityError && <p className="text-xs text-red-600">{identityError}</p>}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={identityPending}
            className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {identityPending ? s.saving : s.saveIdentity}
          </button>
        </div>
      </form>
    </div>
  );
}

function bindingBadge(label: string, ok: boolean) {
  return (
    <span className={`text-[10px] rounded px-1.5 py-0.5 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
      {label}
    </span>
  );
}

export function MemberRow({ user, salesmen }: { user: MemberUser; salesmen: string[] }) {
  const { settings: s } = useMessages();
  const [open, setOpen] = useState(false);
  const role = normalizeUserRole(user.role);

  return (
    <>
      <div className="flex items-center gap-3 group">
        <div className="w-9 h-9 rounded-full bg-slate-200 text-sky-700 flex items-center justify-center text-sm font-semibold shrink-0">
          {user.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{user.name}</span>
            <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{USER_ROLE_LABELS[role]}</span>
            {bindingBadge(s.wecomBadge, !!user.wecomUserId)}
            {bindingBadge(s.crmBadge, !!user.crmSalesmanName)}
          </div>
          <div className="text-xs text-slate-400">
            {user.email}
            {" · "}
            {s.joined.replace("{date}", fmtDate(user.createdAt))}
            {user.wecomUserId ? ` · ${s.wecomBadge} ${user.wecomUserId}` : ""}
            {user.crmSalesmanName ? ` · ${s.crmBadge} ${user.crmSalesmanName}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-sky-600 hover:underline shrink-0"
        >
          {s.editMember}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{s.editMemberTitle.replace("{name}", user.name)}</h3>
            <EditMemberForm user={user} salesmen={salesmen} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
