"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectWorkLogAction } from "@/lib/actions";
import type { OwnerRef } from "@/lib/owner";
import { useMessages } from "@/lib/i18n/context";

export function CreateProjectWorkLogButton({
  owner,
  projectId,
  label,
  buttonClassName,
}: {
  owner: OwnerRef;
  projectId: string;
  label?: string;
  buttonClassName?: string;
}) {
  const c = useMessages().customers;
  const common = useMessages().common;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function submit() {
    const text = content.trim();
    if (!text) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("content", text);
      await createProjectWorkLogAction(owner, fd);
      setContent("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        }
      >
        {label ?? c.addWorkLog}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg border border-slate-200 max-w-md w-full p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-800">{c.projectWorkLogs}</h3>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              autoFocus
              placeholder={c.projectWorkLogPlaceholder}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                {common.cancel}
              </button>
              <button
                type="button"
                disabled={pending || !content.trim()}
                onClick={submit}
                className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700 disabled:opacity-40"
              >
                {pending ? "…" : c.addWorkLog}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
