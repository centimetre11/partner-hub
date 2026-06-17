"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";

export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form
      action={action}
      className="bg-white rounded-2xl shadow-xl shadow-zinc-200/60 border border-zinc-100 p-8 space-y-4"
    >
      {firstRun && (
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Name</label>
          <input
            name="name"
            required
            placeholder="e.g. John Smith"
            className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="you@fanruan.com"
          className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="At least 6 characters"
          className="w-full rounded-lg border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Processing…" : firstRun ? "Create account & sign in" : "Sign in"}
      </button>
    </form>
  );
}
