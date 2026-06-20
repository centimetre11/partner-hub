"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/lib/account-actions";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function PasswordSetup({
  labels,
}: {
  labels: {
    current: string;
    newPassword: string;
    confirm: string;
    save: string;
  };
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("currentPassword", currentPassword);
      fd.set("newPassword", newPassword);
      fd.set("confirmPassword", confirmPassword);
      const res = await changePasswordAction(fd);
      if (res.error) setError(res.error);
      else if (res.message) {
        setMessage(res.message);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{labels.current}</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={input}
          autoComplete="current-password"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{labels.newPassword}</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={input}
          autoComplete="new-password"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{labels.confirm}</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={input}
          autoComplete="new-password"
        />
      </label>
      <button
        type="button"
        disabled={pending || !currentPassword || !newPassword}
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
