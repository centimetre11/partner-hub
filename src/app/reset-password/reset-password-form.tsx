"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordWithTokenAction } from "@/lib/password-reset-actions";
import type { Messages } from "@/lib/i18n/messages/en";

export function ResetPasswordForm({
  token,
  messages: t,
}: {
  token: string;
  messages: Messages["forgotPassword"];
}) {
  const [state, action, pending] = useActionState(resetPasswordWithTokenAction, null);

  if (state?.ok) {
    return (
      <div className="ui-card p-8 space-y-4 text-center">
        <p className="text-sm text-emerald-700">{state.message}</p>
        <Link href="/login" className="ui-btn ui-btn-primary inline-flex py-2.5 px-6">
          {t.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="ui-card p-8 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.newPassword}</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder={t.passwordPlaceholder}
          className="ui-input"
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.confirmPassword}</label>
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={6}
          placeholder={t.passwordPlaceholder}
          className="ui-input"
          autoComplete="new-password"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="ui-btn ui-btn-primary w-full py-2.5">
        {pending ? t.pending : t.resetSubmit}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="text-slate-800 underline-offset-2 hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </form>
  );
}
