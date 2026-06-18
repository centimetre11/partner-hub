"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";
import type { Messages } from "@/lib/i18n/messages/en";

export function LoginForm({
  firstRun,
  messages: lm,
}: {
  firstRun: boolean;
  messages: Messages["login"];
}) {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form
      action={action}
      className="bg-white rounded-2xl shadow-xl shadow-zinc-200/60 border border-zinc-100 p-8 space-y-4"
    >
      {firstRun && (
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">{lm.name}</label>
          <input
            name="name"
            required
            placeholder={lm.namePlaceholder}
            className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">{lm.email}</label>
        <input
          name="email"
          type="email"
          required
          placeholder={lm.emailPlaceholder}
          className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">{lm.password}</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder={lm.passwordPlaceholder}
          className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {pending ? lm.pending : firstRun ? lm.createAndSignIn : lm.signIn}
      </button>
    </form>
  );
}
