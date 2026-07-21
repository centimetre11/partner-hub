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
    <form action={action} className="ui-card p-8 space-y-4">
      {firstRun && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{lm.name}</label>
          <input name="name" required placeholder={lm.namePlaceholder} className="ui-input" />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{lm.email}</label>
        <input name="email" type="email" required placeholder={lm.emailPlaceholder} className="ui-input" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{lm.password}</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder={lm.passwordPlaceholder}
          className="ui-input"
        />
        {!firstRun && (
          <p className="mt-1.5 text-right text-sm">
            <a href="/forgot-password" className="text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">
              {lm.forgotPassword}
            </a>
          </p>
        )}
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="ui-btn ui-btn-primary w-full py-2.5">
        {pending ? lm.pending : firstRun ? lm.createAndSignIn : lm.signIn}
      </button>
    </form>
  );
}
