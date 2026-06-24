"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import { updateCustomerAction, setCustomerPartnerAction } from "@/lib/customer-actions";
import { useMessages } from "@/lib/i18n/context";

type Option = { id: string; name: string };

type CustomerProfile = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  scale: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
  ownerId: string | null;
  owner: { name: string } | null;
  partner: { id: string; name: string } | null;
  partnerRelation: string | null;
};

const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function CustomerProfilePanel({
  customer,
  users,
  partners,
}: {
  customer: CustomerProfile;
  users: Option[];
  partners: Option[];
}) {
  const m = useMessages();
  const c = m.customers;
  const [open, setOpen] = useState(false);

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  const fields: [string, string | null][] = [
    [c.colName, customer.name],
    [c.statusLabel, statusLabel(customer.status)],
    [c.ownerLabel, customer.owner?.name ?? null],
    [c.industryLabel, customer.industry],
    [c.scaleLabel, customer.scale],
    [c.cityPlaceholder, customer.city],
    [c.countryPlaceholder, customer.country],
    [c.websiteLabel, customer.website],
    [c.notesPlaceholder, customer.notes],
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex justify-end">
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-sky-600 hover:underline">
            {c.editProfile}
          </button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {fields.map(([label, value]) => (
            <div key={label} className={label === c.notesPlaceholder ? "sm:col-span-2" : ""}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className={`mt-0.5 whitespace-pre-wrap ${value ? "text-slate-800" : "text-slate-300"}`}>
                {value || m.common.toBeFilled}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-5">
        <Card title={c.boundPartner}>
          {customer.partner ? (
            <div className="space-y-3">
              <Link
                href={`/partners/${customer.partner.id}`}
                className="block rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
              >
                {customer.partner.name}
                {customer.partnerRelation === "SELF" && (
                  <span className="ml-2 text-[10px] rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                    {c.selfBadge}
                  </span>
                )}
              </Link>
              <form action={setCustomerPartnerAction.bind(null, customer.id)}>
                <input type="hidden" name="partnerId" value="" />
                <button className="text-xs text-slate-400 hover:text-red-600">{c.unbind}</button>
              </form>
            </div>
          ) : (
            <form action={setCustomerPartnerAction.bind(null, customer.id)} className="space-y-2">
              <p className="text-sm text-slate-400">{c.notBound}</p>
              <select name="partnerId" defaultValue="" className={input}>
                <option value="">{c.selectPartner}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800">
                {c.bindPartner}
              </button>
            </form>
          )}
        </Card>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">{c.editProfileTitle.replace("{name}", customer.name)}</h3>
            <form
              action={async (fd) => {
                await updateCustomerAction(customer.id, fd);
                setOpen(false);
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label className="text-sm sm:col-span-2">
                <span className="text-xs text-slate-500">{c.colName}</span>
                <input name="name" defaultValue={customer.name} required className={input} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.statusLabel}</span>
                <select name="status" defaultValue={customer.status} className={input}>
                  <option value="ACTIVE">{c.statusActive}</option>
                  <option value="PROSPECT">{c.statusProspect}</option>
                  <option value="INACTIVE">{c.statusInactive}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.ownerLabel}</span>
                <select name="ownerId" defaultValue={customer.ownerId ?? ""} className={input}>
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.industryLabel}</span>
                <input name="industry" defaultValue={customer.industry ?? ""} className={input} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.scaleLabel}</span>
                <input name="scale" defaultValue={customer.scale ?? ""} className={input} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.cityPlaceholder}</span>
                <input name="city" defaultValue={customer.city ?? ""} className={input} />
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{c.countryPlaceholder}</span>
                <input name="country" defaultValue={customer.country ?? ""} className={input} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-xs text-slate-500">{c.websiteLabel}</span>
                <input name="website" defaultValue={customer.website ?? ""} className={input} />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-xs text-slate-500">{c.notesPlaceholder}</span>
                <textarea name="notes" defaultValue={customer.notes ?? ""} rows={3} className={input} />
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  {m.common.cancel}
                </button>
                <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">{c.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
