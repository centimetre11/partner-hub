"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createCustomerAction } from "@/lib/customer-actions";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import { useMessages } from "@/lib/i18n/context";

type Option = { id: string; name: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}

export function AddCustomerForm({
  partners,
  users,
  defaultPartnerId,
  defaultOpen = false,
}: {
  partners: Option[];
  users: Option[];
  defaultPartnerId?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const messages = useMessages();
  const c = messages.customers;
  const cancelLabel = messages.common.cancel;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <>
      <div className="flex gap-2">
        <CustomerAiIntakeButton variant="primary" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {c.add}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{c.addTitle}</h3>
            <form action={createCustomerAction} className="space-y-3">
              <input type="hidden" name="redirectTo" value="detail" />
              <input name="name" required placeholder={c.namePlaceholder} className={input} />
              <div className="flex gap-2">
                <input name="industry" placeholder={c.industryPlaceholder} className={input} />
                <select name="status" defaultValue="ACTIVE" className={input} aria-label={c.statusLabel}>
                  <option value="ACTIVE">{c.statusActive}</option>
                  <option value="PROSPECT">{c.statusProspect}</option>
                  <option value="INACTIVE">{c.statusInactive}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input name="city" placeholder={c.cityPlaceholder} className={input} />
                <input name="country" placeholder={c.countryPlaceholder} className={input} />
              </div>
              <input name="website" placeholder={c.websitePlaceholder} className={input} />
              <input name="scale" placeholder={c.scalePlaceholder} className={input} />
              <div className="flex gap-2">
                <input name="contactName" placeholder={c.contactNamePlaceholder} className={input} />
                <input name="contactTitle" placeholder={c.contactTitlePlaceholder} className={input} />
              </div>
              <div className="flex gap-2">
                <input name="contactPhone" placeholder={c.contactPhonePlaceholder} className={input} />
                <input name="contactEmail" placeholder={c.contactEmailPlaceholder} className={input} />
              </div>
              <div className="flex gap-2">
                <select name="partnerId" defaultValue={defaultPartnerId ?? ""} className={input} aria-label={c.partnerLabel}>
                  <option value="">{c.noPartner}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select name="ownerId" defaultValue="" className={input} aria-label={c.ownerLabel}>
                  <option value="">{c.ownerLabel}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <textarea name="notes" placeholder={c.notesPlaceholder} rows={2} className={input} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
                  {cancelLabel}
                </button>
                <SubmitButton label={c.add} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
