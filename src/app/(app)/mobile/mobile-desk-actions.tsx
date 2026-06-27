"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessRecordForm } from "@/components/business-record-form";
import { createTodoAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";
import type { OwnerRef } from "@/lib/owner";
import { appendTodoOwnerToFormData, encodeTodoOwnerRef, parseOwnerRef, parseTodoOwnerRef } from "@/lib/todo-owner-select";

type Option = { id: string; name: string };

const input =
  "box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function MobileDrawer({
  open,
  onClose,
  title,
  titleId,
  saving,
  cancelLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  saving?: boolean;
  cancelLabel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={cancelLabel}
        className="fixed inset-0 z-40 bg-slate-950/40"
        onClick={() => !saving && onClose()}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 box-border flex max-h-[96dvh] w-full max-w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-slate-200 bg-white shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="min-w-0 text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="shrink-0 rounded-full px-2 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
            aria-label={cancelLabel}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </>
  );
}

export function MobileTodoCapture({
  userId,
  partners,
  customers,
  users,
  labels,
  autoOpen = false,
}: {
  userId: string;
  partners: Option[];
  customers: Option[];
  users: Option[];
  autoOpen?: boolean;
  labels: {
    button: string;
    title: string;
    todoTitle: string;
    titlePlaceholder: string;
    relatedTo: string;
    none: string;
    partnersGroup: string;
    customersGroup: string;
    owner: string;
    dueDate: string;
    priority: string;
    notes: string;
    optional: string;
    cancel: string;
    submit: string;
    saving: string;
    high: string;
    medium: string;
    low: string;
  };
}) {
  const router = useRouter();
  const m = useMessages();
  const [open, setOpen] = useState(autoOpen);
  const [saving, setSaving] = useState(false);
  const [ownerRef, setOwnerRef] = useState("");
  const [link, setLink] = useState("");
  const [linkOptions, setLinkOptions] = useState<{ opportunities: Option[]; projects: Option[] } | null>(null);
  const customerId = parseTodoOwnerRef(ownerRef).customerId;

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) {
      setOwnerRef("");
      setLink("");
      setLinkOptions(null);
    }
  }, [open]);

  useEffect(() => {
    setLink("");
    if (!customerId) {
      setLinkOptions(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/todos/link-options?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { opportunities: Option[]; projects: Option[] }) => {
        if (!cancelled) setLinkOptions(data);
      })
      .catch(() => {
        if (!cancelled) setLinkOptions({ opportunities: [], projects: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const hasLinkOptions = !!linkOptions && (linkOptions.opportunities.length > 0 || linkOptions.projects.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {labels.button}
      </button>

      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={labels.title}
        titleId="mobile-todo-capture-title"
        saving={saving}
        cancelLabel={labels.cancel}
      >
        <form
          className="min-w-0 space-y-3"
          action={async (formData) => {
            setSaving(true);
            try {
              appendTodoOwnerToFormData(formData);
              await createTodoAction(formData);
              setOpen(false);
              router.refresh();
            } catch (err) {
              if (typeof window !== "undefined") {
                window.alert(err instanceof Error ? err.message : String(err));
              }
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.todoTitle}</span>
            <input name="title" required autoFocus placeholder={labels.titlePlaceholder} className={input} />
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.relatedTo}</span>
            <select name="ownerRef" value={ownerRef} onChange={(e) => setOwnerRef(e.target.value)} className={input}>
              <option value="">{labels.none}</option>
              {partners.length > 0 && (
                <optgroup label={labels.partnersGroup}>
                  {partners.map((item) => (
                    <option key={item.id} value={encodeTodoOwnerRef("partner", item.id)}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {customers.length > 0 && (
                <optgroup label={labels.customersGroup}>
                  {customers.map((item) => (
                    <option key={item.id} value={encodeTodoOwnerRef("customer", item.id)}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          {customerId && hasLinkOptions && (
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-slate-500">{m.common.linkLabel}</span>
              <select name="link" value={link} onChange={(e) => setLink(e.target.value)} className={input}>
                <option value="">{m.common.linkNone}</option>
                {linkOptions!.opportunities.length > 0 && (
                  <optgroup label={m.common.linkOpportunity}>
                    {linkOptions!.opportunities.map((o) => (
                      <option key={o.id} value={`opp:${o.id}`}>
                        {o.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {linkOptions!.projects.length > 0 && (
                  <optgroup label={m.common.linkProject}>
                    {linkOptions!.projects.map((p) => (
                      <option key={p.id} value={`proj:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          )}

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.owner}</span>
            <select name="assigneeId" defaultValue={userId} className={input}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.dueDate}</span>
            <input name="dueDate" type="date" className={input} />
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.notes}</span>
            <input name="detail" placeholder={labels.optional} className={input} />
          </label>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => setOpen(false)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? labels.saving : labels.submit}
            </button>
          </div>
        </form>
      </MobileDrawer>
    </>
  );
}

export function MobileBusinessRecordCapture({
  partners,
  customers,
  labels,
  autoOpen = false,
}: {
  partners: Option[];
  customers: Option[];
  autoOpen?: boolean;
  labels: {
    button: string;
    title: string;
    selectTarget: string;
    none: string;
    partnersGroup: string;
    customersGroup: string;
    pickTarget: string;
    cancel: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [ownerRef, setOwnerRef] = useState("");

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const parsed = parseOwnerRef(ownerRef);
  const owner: OwnerRef | null = parsed
    ? parsed.kind === "partner"
      ? { kind: "partner", id: parsed.id }
      : { kind: "customer", id: parsed.id }
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {labels.button}
      </button>

      <MobileDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          setOwnerRef("");
        }}
        title={labels.title}
        titleId="mobile-record-capture-title"
        cancelLabel={labels.cancel}
      >
        <div className="min-w-0 space-y-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.selectTarget}</span>
            <select value={ownerRef} onChange={(e) => setOwnerRef(e.target.value)} className={input}>
              <option value="">{labels.none}</option>
              {partners.length > 0 && (
                <optgroup label={labels.partnersGroup}>
                  {partners.map((item) => (
                    <option key={item.id} value={`partner:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {customers.length > 0 && (
                <optgroup label={labels.customersGroup}>
                  {customers.map((item) => (
                    <option key={item.id} value={`customer:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          {owner ? (
            <BusinessRecordForm
              owner={owner}
              source="MANUAL"
              compact
              onDone={() => {
                setOpen(false);
                setOwnerRef("");
                router.refresh();
              }}
            />
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">{labels.pickTarget}</p>
          )}
        </div>
      </MobileDrawer>
    </>
  );
}
