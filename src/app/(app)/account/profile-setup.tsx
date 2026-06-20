"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/lib/account-actions";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function ProfileSetup({
  name,
  email,
  labels,
}: {
  name: string;
  email: string;
  labels: {
    displayName: string;
    email: string;
    emailHint: string;
    save: string;
  };
}) {
  const [displayName, setDisplayName] = useState(name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("name", displayName.trim());
      const res = await updateProfileAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{labels.displayName}</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={input}
          autoComplete="name"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{labels.email}</span>
        <input value={email} readOnly className={`${input} bg-slate-50 text-slate-500`} />
        <p className="text-xs text-slate-400">{labels.emailHint}</p>
      </label>
      <button
        type="button"
        disabled={pending || !displayName.trim()}
        onClick={save}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
      >
        {labels.save}
      </button>
      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>}
    </div>
  );
}
