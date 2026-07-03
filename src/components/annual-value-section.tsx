"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Partner } from "@prisma/client";
import { updatePartnerAction } from "@/lib/actions";
import { ModalPortal } from "@/components/modal-portal";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400";

export function AnnualValueSection({ partner }: { partner: Partner }) {
  const m = useMessages();
  const pd = m.partnerDetail;
  const pe = m.profileEditor;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const rows = [
    [pd.partnerAnnualRevenue, partner.partnerAnnualRevenue],
    [pd.partnerDealsPerYear, partner.partnerDealsPerYear],
    [pd.estimatedAnnualValue, partner.estimatedAnnualValue],
  ] as const;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{pd.annualValueEstimate}</h3>
          <p className="text-xs text-slate-500 mt-1">{pd.annualValueHint}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-emerald-700 hover:text-emerald-900 shrink-0 font-medium"
        >
          {pe.editProfile}
        </button>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`mt-1 font-medium ${value ? "text-emerald-900" : "text-slate-300 font-normal"}`}>
              {value || m.common.toBeFilled}
            </dd>
          </div>
        ))}
      </dl>

      {open && (
        <ModalPortal onClose={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold mb-4">{pd.annualValueEstimate}</h3>
            <form
              action={async (fd) => {
                setSaving(true);
                try {
                  await updatePartnerAction(partner.id, fd);
                  setOpen(false);
                  router.refresh();
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-3 text-sm"
            >
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">{pe.partnerAnnualRevenue}</span>
                <input
                  name="partnerAnnualRevenue"
                  defaultValue={partner.partnerAnnualRevenue ?? ""}
                  placeholder={pe.partnerAnnualRevenuePlaceholder}
                  className={input}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">{pe.partnerDealsPerYear}</span>
                <input
                  name="partnerDealsPerYear"
                  defaultValue={partner.partnerDealsPerYear ?? ""}
                  placeholder={pe.partnerDealsPerYearPlaceholder}
                  className={input}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">{pe.estimatedAnnualValue}</span>
                <input
                  name="estimatedAnnualValue"
                  defaultValue={partner.estimatedAnnualValue ?? ""}
                  placeholder={pe.estimatedAnnualValuePlaceholder}
                  className={input}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  {m.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm hover:bg-emerald-800 disabled:opacity-60"
                >
                  {saving ? m.common.loading : pe.save}
                </button>
              </div>
            </form>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
