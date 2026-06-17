"use client";

import { useActionState } from "react";
import { registerAction } from "@/lib/actions";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null);

  return (
    <form action={action} className="border-t border-zinc-100 pt-4 space-y-2.5">
      <div className="text-xs font-medium text-zinc-500">Add member</div>
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required placeholder="Name" className={input} />
        <input name="email" type="email" required placeholder="Email" className={input} />
      </div>
      <input name="password" type="password" required minLength={6} placeholder="Initial password (min. 6 characters)" className={input} />
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-600">Member added</p>}
      <button disabled={pending} className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50">
        {pending ? "Adding…" : "Add member"}
      </button>
    </form>
  );
}
