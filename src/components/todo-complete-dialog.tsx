"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeTodoWithNoteAction, toggleTodoAction } from "@/lib/actions";
import { useLabels, useMessages } from "@/lib/i18n/context";
import type { OwnerRef } from "@/lib/owner";

const CATEGORIES = ["VISIT", "TRAINING", "NEGOTIATION", "DELIVERY", "RELATIONSHIP", "OTHER"] as const;

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function resolveOwner(partnerId: string | null | undefined, customerId: string | null | undefined): OwnerRef | null {
  if (customerId) return { kind: "customer", id: customerId };
  if (partnerId) return { kind: "partner", id: partnerId };
  return null;
}

export function TodoCompleteDialog({
  open,
  todoId,
  todoTitle,
  partnerId,
  customerId,
  contacts = [],
  onClose,
}: {
  open: boolean;
  todoId: string;
  todoTitle: string;
  partnerId?: string | null;
  customerId?: string | null;
  contacts?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useMessages().todos;
  const pd = useMessages().partnerDetail;
  const common = useMessages().common;
  const labels = useLabels();
  const router = useRouter();
  const owner = resolveOwner(partnerId, customerId);
  const canSync = !!owner;

  const [note, setNote] = useState("");
  const [sync, setSync] = useState(canSync);
  const [category, setCategory] = useState<string>("OTHER");
  const [contactId, setContactId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "warn" | "info" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setSync(canSync);
    setCategory("OTHER");
    setContactId("");
    setFeedback(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, canSync, submitting, onClose]);

  function appendQuick(text: string) {
    setNote((prev) => (prev ? `${prev}${prev.endsWith("，") || prev.endsWith(",") ? " " : "，"}${text}` : text));
  }

  async function submit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setFeedback({ tone: "err", text: t.noteRequired });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.set("todoId", todoId);
      fd.set("note", trimmed);
      fd.set("syncToBusinessRecord", sync && canSync ? "true" : "false");
      fd.set("category", category);
      if (contactId) fd.set("contactId", contactId);
      const res = await completeTodoWithNoteAction(fd);
      if (!res.ok) {
        setFeedback({ tone: "err", text: t.noteRequired });
        return;
      }
      if (res.message) setFeedback({ tone: "ok", text: res.message });
      else if (res.warning) setFeedback({ tone: "warn", text: res.warning });
      else if (res.info) setFeedback({ tone: "info", text: res.info });
      router.refresh();
      if (!res.warning) onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !submitting && onClose()}>
      <div
        role="dialog"
        aria-modal
        aria-labelledby="todo-complete-title"
        className="bg-white rounded-lg border border-slate-200 max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 id="todo-complete-title" className="text-sm font-semibold text-slate-800">
            {t.completeTitle}
          </h3>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{todoTitle}</p>
        </div>

        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500">{t.completeNoteLabel}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder={t.completeNotePlaceholder}
              className={input}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {t.completeQuickInputs.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => appendQuick(text)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 hover:border-slate-300"
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {canSync && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sync}
                onChange={(e) => setSync(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>
                <span className="text-xs font-medium text-slate-800">{t.syncToBusinessRecord}</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{t.syncToBusinessRecordHint}</span>
              </span>
            </label>
            {sync && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-500">{pd.businessRecordCategory}</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {labels.businessRecordCategoryLabels[c] ?? c}
                      </option>
                    ))}
                  </select>
                </label>
                {contacts.length > 0 && (
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-500">{pd.businessRecordContact}</span>
                    <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={input}>
                      <option value="">—</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {feedback && (
          <div
            className={`rounded-lg text-xs px-3 py-2 ${
              feedback.tone === "ok"
                ? "bg-emerald-50 text-emerald-800"
                : feedback.tone === "warn"
                  ? "bg-amber-50 text-amber-800"
                  : feedback.tone === "err"
                    ? "bg-red-50 text-red-800"
                    : "bg-slate-50 text-slate-600"
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {common.cancel}
          </button>
          <button
            type="button"
            disabled={submitting || !note.trim()}
            onClick={() => void submit()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 hover:bg-slate-800"
          >
            {submitting ? t.completeSubmitting : t.completeConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TodoCompleteButton({
  todoId,
  title,
  status,
  partnerId,
  customerId,
  contacts = [],
  className,
  size = "md",
}: {
  todoId: string;
  title: string;
  status: string;
  partnerId?: string | null;
  customerId?: string | null;
  contacts?: { id: string; name: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const m = useMessages().common;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isDone = status === "DONE";

  const sizeClass = size === "sm" ? "w-4 h-4 text-[10px]" : "w-4.5 h-4.5 text-[10px]";

  async function reopen() {
    setLoading(true);
    try {
      await toggleTodoAction(todoId);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (isDone) {
      void reopen();
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        aria-label={isDone ? m.edit : m.done}
        onClick={handleClick}
        className={`${sizeClass} mt-0.5 rounded border flex items-center justify-center shrink-0 ${
          isDone ? "bg-slate-900 border-slate-900 text-white" : "border-slate-300 hover:border-slate-400"
        } ${className ?? ""}`}
      >
        {isDone && "✓"}
      </button>
      <TodoCompleteDialog
        open={open}
        todoId={todoId}
        todoTitle={title}
        partnerId={partnerId}
        customerId={customerId}
        contacts={contacts}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
