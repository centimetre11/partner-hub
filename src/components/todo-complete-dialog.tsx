"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeTodoWithNoteAction, toggleTodoAction } from "@/lib/actions";
import { BusinessRecordDimensions, CrmBindingStatus } from "@/components/business-record-dimensions";
import { CrmRecorderPicker, useDefaultCrmRecorderSelection, type CrmRecorderOption } from "@/components/crm-recorder-picker";
import { useMessages } from "@/lib/i18n/context";
import type { OwnerRef } from "@/lib/owner";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function resolveOwner(partnerId: string | null | undefined, customerId: string | null | undefined): OwnerRef | null {
  if (customerId) return { kind: "customer", id: customerId };
  if (partnerId) return { kind: "partner", id: partnerId };
  return null;
}

type CrmMeta = {
  crmCustomerBound: boolean;
  crmCustomerName: string | null;
  crmSalesmanBound: boolean;
  currentUserId?: string;
  crmRecorders?: CrmRecorderOption[];
};

export function TodoCompleteDialog({
  open,
  todoId,
  todoTitle,
  partnerId,
  customerId,
  onClose,
  onCompleted,
}: {
  open: boolean;
  todoId: string;
  todoTitle: string;
  partnerId?: string | null;
  customerId?: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const t = useMessages().todos;
  const ip = useMessages().intakePanel;
  const common = useMessages().common;
  const router = useRouter();
  const owner = resolveOwner(partnerId, customerId);
  const canSync = !!owner;

  const [note, setNote] = useState("");
  const [sync, setSync] = useState(canSync);
  const [dims, setDims] = useState({
    traceNature: "",
    traceAction: "",
    contactName: "",
  });
  const [crmMeta, setCrmMeta] = useState<CrmMeta | null>(null);
  const [selectedRecorderIds, setSelectedRecorderIds] = useDefaultCrmRecorderSelection(
    crmMeta?.crmRecorders,
    crmMeta?.currentUserId,
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "warn" | "info" | "err"; text: string } | null>(null);

  const patchDims = useCallback((patch: Partial<typeof dims>) => {
    setDims((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setSync(canSync);
    setDims({ traceNature: "", traceAction: "", contactName: "" });
    setCrmMeta(null);
    setFeedback(null);

    if (canSync) {
      const qs = customerId ? `customerId=${customerId}` : `partnerId=${partnerId}`;
      void fetch(`/api/business-record/meta?${qs}`)
        .then((r) => r.json())
        .then((data: CrmMeta) => setCrmMeta(data))
        .catch(() => setCrmMeta(null));
    }

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
  }, [open, canSync, customerId, partnerId, submitting, onClose]);

  function appendQuick(text: string) {
    setNote((prev) => (prev ? `${prev}${prev.endsWith("，") || prev.endsWith(",") ? " " : "，"}${text}` : text));
  }

  async function submit() {
    const trimmed = note.trim();
    if (!trimmed) {
      setFeedback({ tone: "err", text: t.noteRequired });
      return;
    }
    if (sync && canSync && (!dims.traceNature || !dims.traceAction)) {
      setFeedback({ tone: "err", text: ip.crmFieldsRequired });
      return;
    }
    if (sync && canSync && !selectedRecorderIds.length) {
      setFeedback({ tone: "err", text: ip.crmRecorderRequired });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.set("todoId", todoId);
      fd.set("note", trimmed);
      fd.set("syncToBusinessRecord", sync && canSync ? "true" : "false");
      fd.set("traceNature", dims.traceNature);
      fd.set("traceAction", dims.traceAction);
      if (dims.contactName.trim()) fd.set("contactName", dims.contactName.trim());
      for (const id of selectedRecorderIds) fd.append("crmRecorderUserIds", id);
      const res = await completeTodoWithNoteAction(fd);
      if (!res.ok) {
        if (res.error === "crm_fields_required") {
          setFeedback({ tone: "err", text: ip.crmFieldsRequired });
          return;
        }
        if (res.error === "crm_recorders_required" || res.error === "crm_recorders_unmapped") {
          setFeedback({ tone: "err", text: ip.crmRecorderRequired });
          return;
        }
        setFeedback({ tone: "err", text: t.noteRequired });
        return;
      }
      if (res.message) setFeedback({ tone: "ok", text: res.message });
      else if (res.warning) setFeedback({ tone: "warn", text: res.warning });
      else if (res.info) setFeedback({ tone: "info", text: res.info });
      onCompleted?.();
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
        className="bg-white rounded-lg border border-slate-200 max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto"
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
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-3">
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
              <>
                {crmMeta && (
                  <CrmBindingStatus
                    crmCustomerBound={crmMeta.crmCustomerBound}
                    crmSalesmanBound={crmMeta.crmSalesmanBound}
                    crmCustomerName={crmMeta.crmCustomerName}
                  />
                )}
                <BusinessRecordDimensions
                  values={dims}
                  onChange={patchDims}
                  inferTitle={todoTitle}
                  inferContent={note}
                  compact
                />
                {crmMeta?.crmRecorders && crmMeta.currentUserId && (
                  <CrmRecorderPicker
                    recorders={crmMeta.crmRecorders}
                    currentUserId={crmMeta.currentUserId}
                    selectedIds={selectedRecorderIds}
                    onChange={setSelectedRecorderIds}
                    compact
                  />
                )}
              </>
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
  className,
  size = "md",
  onStatusChange,
}: {
  todoId: string;
  title: string;
  status: string;
  partnerId?: string | null;
  customerId?: string | null;
  className?: string;
  size?: "sm" | "md";
  /** 完成/重开后回调（会前简报等快照 UI 可据此本地更新） */
  onStatusChange?: (nextStatus: "OPEN" | "DONE") => void;
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
      onStatusChange?.("OPEN");
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
        onClose={() => setOpen(false)}
        onCompleted={() => {
          onStatusChange?.("DONE");
        }}
      />
    </>
  );
}
