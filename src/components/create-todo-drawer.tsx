"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createTodoAction } from "@/lib/actions";
import { useMessages } from "@/lib/i18n/context";
import { appendTodoOwnerToFormData, encodeTodoOwnerRef, parseTodoOwnerRef } from "@/lib/todo-owner-select";

type Option = { id: string; name: string };

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function CreateTodoDrawer({
  userId,
  partners,
  customers,
  users,
  defaultOwnerRef = "",
  /** Pre-select opportunity/project link: opp:<id> / proj:<id> */
  defaultLink = "",
  /** When set, written to FormData as TodoItem.source (e.g. ARR from calendar). */
  source,
  /** Lock related owner to defaultOwnerRef (no switching partner/customer). */
  lockOwner = false,
  buttonClassName,
  buttonLabel,
  buttonSuffix,
}: {
  userId: string;
  partners: Option[];
  customers: Option[];
  users: Option[];
  /** Pre-select related partner/customer on open (e.g. on detail pages). */
  defaultOwnerRef?: string;
  defaultLink?: string;
  source?: string;
  lockOwner?: boolean;
  buttonClassName?: string;
  buttonLabel?: string;
  buttonSuffix?: React.ReactNode;
}) {
  const m = useMessages();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerRef, setOwnerRef] = useState(defaultOwnerRef);
  const [link, setLink] = useState(defaultLink);
  const [linkOptions, setLinkOptions] = useState<{ opportunities: Option[]; projects: Option[] } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const parsedOwner = parseTodoOwnerRef(ownerRef);
  const customerId = parsedOwner.customerId;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, saving]);

  useEffect(() => {
    if (open) {
      setOwnerRef(defaultOwnerRef);
      setLink(defaultLink);
    } else {
      setLinkOptions(null);
      setLinkLoading(false);
    }
  }, [open, defaultOwnerRef, defaultLink]);

  useEffect(() => {
    setLink("");
    if (!customerId) {
      setLinkOptions(null);
      setLinkLoading(false);
      return;
    }
    let cancelled = false;
    setLinkLoading(true);
    fetch(`/api/todos/link-options?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: { opportunities: Option[]; projects: Option[] }) => {
        if (!cancelled) setLinkOptions(data);
      })
      .catch(() => {
        if (!cancelled) setLinkOptions({ opportunities: [], projects: [] });
      })
      .finally(() => {
        if (!cancelled) setLinkLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const hasLinkOptions =
    !!linkOptions && (linkOptions.opportunities.length > 0 || linkOptions.projects.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-slate-700 shrink-0"
        }
      >
        {buttonLabel ?? (buttonClassName ? m.dashboard.createTodo : `+ ${m.dashboard.createTodo}`)}
        {buttonSuffix}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/25 z-40"
            onClick={() => !saving && setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="create-todo-title"
            className="fixed right-0 top-0 z-50 flex h-full w-[min(22rem,92vw)] flex-col bg-white border border-slate-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 id="create-todo-title" className="text-sm font-semibold text-slate-900">
                {m.dashboard.createTodo}
              </h2>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                aria-label={m.common.cancel}
              >
                ×
              </button>
            </div>

            <form
              className="flex flex-1 flex-col overflow-y-auto p-4"
              action={async (formData) => {
                setSaving(true);
                try {
                  appendTodoOwnerToFormData(formData);
                  if (link) formData.set("link", link);
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
              <div className="space-y-3 text-sm flex-1">
                {source ? <input type="hidden" name="source" value={source} /> : null}
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{m.todos.fieldTitle}</span>
                  <input
                    name="title"
                    required
                    autoFocus
                    placeholder={m.partnerDetail.addTodoPlaceholder}
                    className={input}
                  />
                </label>

                {lockOwner && (ownerRef || defaultOwnerRef) ? (
                  <>
                    <input type="hidden" name="ownerRef" value={ownerRef || defaultOwnerRef} />
                    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
                      <div>
                        <span className="text-slate-400">{m.todos.fieldRelated}：</span>
                        {parsedOwner.customerId
                          ? (customers.find((c) => c.id === parsedOwner.customerId)?.name ??
                            parsedOwner.customerId)
                          : parsedOwner.partnerId
                            ? (partners.find((p) => p.id === parsedOwner.partnerId)?.name ??
                              parsedOwner.partnerId)
                            : "—"}
                        {source === "ARR" ? (
                          <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                            ARR
                          </span>
                        ) : null}
                      </div>
                      {link ? (
                        <div>
                          <span className="text-slate-400">{m.todos.fieldLink}：</span>
                          {linkLoading
                            ? m.common.loading
                            : link.startsWith("proj:")
                              ? (linkOptions?.projects.find((p) => p.id === link.slice(5))?.name ??
                                link.slice(5))
                              : link.startsWith("opp:")
                                ? (linkOptions?.opportunities.find((o) => o.id === link.slice(4))
                                    ?.name ?? link.slice(4))
                                : link}
                        </div>
                      ) : null}
                    </div>
                    {link ? <input type="hidden" name="link" value={link} /> : null}
                  </>
                ) : (
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-slate-500">{m.todos.fieldRelated}</span>
                    <select
                      name="ownerRef"
                      value={ownerRef}
                      onChange={(e) => setOwnerRef(e.target.value)}
                      className={input}
                    >
                      <option value="">{m.todos.noRelated}</option>
                      {partners.length > 0 && (
                        <optgroup label={m.todos.partnersGroup}>
                          {partners.map((p) => (
                            <option key={p.id} value={encodeTodoOwnerRef("partner", p.id)}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {customers.length > 0 && (
                        <optgroup label={m.todos.customersGroup}>
                          {customers.map((c) => (
                            <option key={c.id} value={encodeTodoOwnerRef("customer", c.id)}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                )}

                {!lockOwner && customerId && (
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-slate-500">{m.todos.fieldLink}</span>
                    {linkLoading ? (
                      <div className={`${input} text-slate-400`}>{m.common.loading}</div>
                    ) : hasLinkOptions ? (
                      <select name="link" value={link} onChange={(e) => setLink(e.target.value)} className={input}>
                        <option value="">{m.todos.linkNone}</option>
                        {linkOptions!.opportunities.length > 0 && (
                          <optgroup label={m.todos.opportunitiesGroup}>
                            {linkOptions!.opportunities.map((o) => (
                              <option key={o.id} value={`opp:${o.id}`}>
                                {o.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {linkOptions!.projects.length > 0 && (
                          <optgroup label={m.todos.projectsGroup}>
                            {linkOptions!.projects.map((p) => (
                              <option key={p.id} value={`proj:${p.id}`}>
                                {p.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    ) : (
                      <div className={`${input} text-slate-400 bg-slate-50`}>{m.todos.linkNone}</div>
                    )}
                  </label>
                )}

                {!customerId && ownerRef && parsedOwner.partnerId && (
                  <p className="text-[11px] text-slate-400">{m.todos.linkCustomerOnlyHint}</p>
                )}

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{m.common.owner}</span>
                  <select name="assigneeId" className={input} defaultValue={userId}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{m.todos.fieldDueDate}</span>
                  <input name="dueDate" type="date" className={input} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">{m.todos.fieldNotes}</span>
                  <input name="detail" placeholder={m.todos.fieldNotesOptional} className={input} />
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {m.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? m.intakePanel.saving : m.dashboard.createTodo}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
