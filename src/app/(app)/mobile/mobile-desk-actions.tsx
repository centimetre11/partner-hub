"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessRecordForm } from "@/components/business-record-form";
import { createTodoAction } from "@/lib/actions";
import type { OwnerRef } from "@/lib/owner";

type Option = { id: string; name: string };

type LinkKind = "" | "partner" | "customer";
type TargetKind = "partner" | "customer";

const input =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

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
        className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[1.75rem] border border-slate-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:top-4 sm:h-auto sm:max-h-[88dvh] sm:w-[26rem] sm:rounded-[1.75rem]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-full px-2 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
            aria-label={cancelLabel}
          >
            x
          </button>
        </div>
        {children}
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
}: {
  userId: string;
  partners: Option[];
  customers: Option[];
  users: Option[];
  labels: {
    button: string;
    title: string;
    todoTitle: string;
    titlePlaceholder: string;
    linkKind: string;
    linkNone: string;
    linkPartner: string;
    linkCustomer: string;
    partner: string;
    customer: string;
    noPartner: string;
    noCustomer: string;
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
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkKind, setLinkKind] = useState<LinkKind>("");

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
          className="space-y-3"
          action={async (formData) => {
            setSaving(true);
            try {
              await createTodoAction(formData);
              setOpen(false);
              setLinkKind("");
              router.refresh();
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.todoTitle}</span>
            <input name="title" required autoFocus placeholder={labels.titlePlaceholder} className={input} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.linkKind}</span>
            <select
              value={linkKind}
              onChange={(e) => setLinkKind(e.target.value as LinkKind)}
              className={input}
            >
              <option value="">{labels.linkNone}</option>
              <option value="partner">{labels.linkPartner}</option>
              <option value="customer">{labels.linkCustomer}</option>
            </select>
          </label>

          {linkKind === "partner" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{labels.partner}</span>
              <select name="partnerId" required defaultValue="" className={input}>
                <option value="">{labels.noPartner}</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {linkKind === "customer" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{labels.customer}</span>
              <select name="customerId" required defaultValue="" className={input}>
                <option value="">{labels.noCustomer}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.owner}</span>
            <select name="assigneeId" defaultValue={userId} className={input}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{labels.dueDate}</span>
              <input name="dueDate" type="date" className={input} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">{labels.priority}</span>
              <select name="priority" defaultValue="MEDIUM" className={input}>
                <option value="HIGH">{labels.high}</option>
                <option value="MEDIUM">{labels.medium}</option>
                <option value="LOW">{labels.low}</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.notes}</span>
            <input name="detail" placeholder={labels.optional} className={input} />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => setOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
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
}: {
  partners: Option[];
  customers: Option[];
  labels: {
    button: string;
    title: string;
    targetKind: string;
    partner: string;
    customer: string;
    selectPartner: string;
    selectCustomer: string;
    pickTarget: string;
    cancel: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetKind, setTargetKind] = useState<TargetKind>("partner");
  const [targetId, setTargetId] = useState("");

  const owner: OwnerRef | null = targetId
    ? targetKind === "partner"
      ? { kind: "partner", id: targetId }
      : { kind: "customer", id: targetId }
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
          setTargetId("");
        }}
        title={labels.title}
        titleId="mobile-record-capture-title"
        cancelLabel={labels.cancel}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">{labels.targetKind}</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetKind("partner");
                  setTargetId("");
                }}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  targetKind === "partner"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {labels.partner}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetKind("customer");
                  setTargetId("");
                }}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  targetKind === "customer"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {labels.customer}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {targetKind === "partner" ? labels.selectPartner : labels.selectCustomer}
            </span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className={input}
            >
              <option value="">
                {targetKind === "partner" ? labels.selectPartner : labels.selectCustomer}
              </option>
              {(targetKind === "partner" ? partners : customers).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {owner ? (
            <BusinessRecordForm
              owner={owner}
              source="MANUAL"
              compact
              onDone={() => {
                setOpen(false);
                setTargetId("");
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
