"use client";

import { useActionState } from "react";
import { registerAction } from "@/lib/actions";
import { UserRoleSelect } from "@/components/partner-team-fields";
import { useMessages } from "@/lib/i18n/context";

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function RegisterForm() {
  const { settings: s, account: a } = useMessages();
  const [state, action, pending] = useActionState(registerAction, null);

  return (
    <form action={action} className="border-t border-slate-100 pt-4 space-y-2.5">
      <div className="text-xs font-medium text-slate-500">{s.addMember}</div>
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required placeholder={a.displayName} className={input} />
        <input name="email" type="email" required placeholder={a.email} className={input} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <UserRoleSelect defaultValue="SALES" />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder={a.newPassword}
          className={input}
        />
      </div>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-600">{s.memberAdded}</p>}
      <button disabled={pending} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-50">
        {pending ? s.saving : s.addMemberBtn}
      </button>
    </form>
  );
}
