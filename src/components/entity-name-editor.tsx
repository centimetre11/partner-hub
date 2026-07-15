"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";

type UpdateResult = { ok?: true; error?: string } | void | undefined;

export function EntityNameEditor({
  entityId,
  name,
  updateAction,
}: {
  entityId: string;
  name: string;
  updateAction: (id: string, formData: FormData) => Promise<UpdateResult>;
}) {
  const m = useMessages();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(name);
  }, [name]);

  const inputClass =
    "rounded-lg border border-slate-200 px-2 py-1 text-xl sm:text-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 min-w-0 flex-1";

  const formatError = (code: string) => {
    if (code === "DUPLICATE_NAME") return m.common.duplicateName.replace("{name}", value.trim());
    if (code === "NAME_REQUIRED") return m.common.nameRequired;
    return code;
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(m.common.nameRequired);
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("name", trimmed);
      const result = await updateAction(entityId, fd);
      if (result && "error" in result && result.error) {
        setError(formatError(result.error));
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0 group">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setError(null);
            setEditing(true);
          }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-sky-600 shrink-0 p-1 rounded transition-opacity"
          title={m.common.rename}
          aria-label={m.common.rename}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2.695 14.763l-1.262 3.155a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.501a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setValue(name);
              setEditing(false);
              setError(null);
            }
          }}
          className={inputClass}
          autoFocus
          disabled={saving}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-slate-900 text-white px-2.5 py-1 text-xs hover:bg-slate-800 disabled:opacity-60 shrink-0"
        >
          {saving ? m.common.loading : m.common.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setEditing(false);
            setError(null);
          }}
          disabled={saving}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 shrink-0"
        >
          {m.common.cancel}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
