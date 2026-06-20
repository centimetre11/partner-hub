"use client";

import { useState, useTransition } from "react";
import { saveWecomUserIdAction } from "@/lib/wecom-actions";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function WecomUserSetup({ wecomUserId }: { wecomUserId: string | null }) {
  const w = useMessages().wecom;
  const [value, setValue] = useState(wecomUserId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      const fd = new FormData();
      fd.set("wecomUserId", value);
      const res = await saveWecomUserIdAction(fd);
      if ("error" in res && typeof res.error === "string") setError(res.error);
      else if ("message" in res && res.message) setMessage(res.message);
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-slate-500 leading-relaxed">{w.userMappingHint}</p>

      <details className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">{w.howToFindTitle}</summary>
        <ol className="mt-2 list-decimal list-inside space-y-1.5 leading-relaxed">
          <li>{w.howToFindAdmin}</li>
          <li>{w.howToFindProfile}</li>
          <li>{w.howToFindBot}</li>
        </ol>
      </details>

      {wecomUserId ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
          {w.userMapped.replace("{id}", wecomUserId)}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          {w.userNotMapped}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{w.userIdLabel}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={w.userIdPlaceholder}
          className={input}
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-slate-400">{w.userIdHint}</p>
      </label>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
      >
        {w.saveMapping}
      </button>

      {message && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs px-3 py-2">{message}</div>}
      {error && <div className="rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">{error}</div>}
    </div>
  );
}
