"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/password-reset-actions";
import type { Messages } from "@/lib/i18n/messages/en";

export function ForgotPasswordForm({ messages: t }: { messages: Messages["forgotPassword"] }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);

  return (
    <form action={action} className="ui-card p-8 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.email}</label>
        <input
          name="email"
          type="email"
          required
          placeholder={t.emailPlaceholder}
          className="ui-input"
          autoComplete="email"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && state.message && (
        <p className="text-sm text-emerald-700 rounded-lg bg-emerald-50 px-3 py-2">{state.message}</p>
      )}
      <button disabled={pending} className="ui-btn ui-btn-primary w-full py-2.5">
        {pending ? t.pending : t.submit}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="text-slate-800 underline-offset-2 hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </form>
  );
}
