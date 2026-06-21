import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { PendingButton } from "@/components/pending-button";
import {
  bindCustomerToPartnerAction,
  unbindCustomerFromPartnerAction,
  createCustomerForPartnerAction,
  createSelfCustomerForPartnerAction,
} from "@/lib/customer-actions";

type CustomerLite = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  partnerRelation: string | null;
};

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

export function PartnerCustomersSection({
  partnerId,
  customers,
  unboundCustomers,
  copy,
  statusLabels,
}: {
  partnerId: string;
  customers: CustomerLite[];
  unboundCustomers: { id: string; name: string }[];
  copy: {
    title: string;
    desc: string;
    empty: string;
    bindExisting: string;
    selectCustomer: string;
    bind: string;
    noUnbound: string;
    addNew: string;
    newNamePlaceholder: string;
    newIndustryPlaceholder: string;
    newCityPlaceholder: string;
    add: string;
    unbind: string;
    viewDetail: string;
    selfBadge: string;
    createSelf: string;
    createSelfHint: string;
  };
  statusLabels: Record<string, string>;
}) {
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
  const hasSelf = customers.some((cust) => cust.partnerRelation === "SELF");

  return (
    <Card title={copy.title.replace("{count}", String(customers.length))}>
      <p className="text-xs text-slate-400 mb-3">{copy.desc}</p>

      {!hasSelf && (
        <form action={createSelfCustomerForPartnerAction.bind(null, partnerId)} className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
          <span className="text-xs text-indigo-700">{copy.createSelfHint}</span>
          <button className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs shrink-0 hover:bg-indigo-500">{copy.createSelf}</button>
        </form>
      )}

      <div className="space-y-2">
        {customers.map((cust) => (
          <div key={cust.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 hover:border-slate-200">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/customers/${cust.id}`} className="font-medium text-slate-900 hover:text-sky-700">{cust.name}</Link>
                <Badge tone={statusTone(cust.status)}>{statusLabels[cust.status] ?? cust.status}</Badge>
                {cust.partnerRelation === "SELF" && <Badge tone="indigo">{copy.selfBadge}</Badge>}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {[cust.industry, [cust.city, cust.country].filter(Boolean).join(" · ")].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link href={`/customers/${cust.id}`} className="text-xs text-sky-600 hover:underline">{copy.viewDetail}</Link>
              <form action={unbindCustomerFromPartnerAction.bind(null, partnerId, cust.id)}>
                <button className="text-xs text-slate-400 hover:text-red-600">{copy.unbind}</button>
              </form>
            </div>
          </div>
        ))}
        {customers.length === 0 && <EmptyState text={copy.empty} />}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
          <div className="text-xs font-medium text-slate-600 mb-2">{copy.bindExisting}</div>
          {unboundCustomers.length > 0 ? (
            <form action={bindCustomerToPartnerAction.bind(null, partnerId)} className="flex gap-2">
              <select name="customerId" defaultValue="" className={input} required>
                <option value="" disabled>{copy.selectCustomer}</option>
                {unboundCustomers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-800">{copy.bind}</button>
            </form>
          ) : (
            <p className="text-xs text-slate-400">{copy.noUnbound}</p>
          )}
        </div>

        <details className="rounded-lg border border-dashed border-slate-200 p-3">
          <summary className="text-sm text-sky-600 cursor-pointer list-none">{copy.addNew}</summary>
          <form action={createCustomerForPartnerAction.bind(null, partnerId)} className="mt-3 space-y-2">
            <input name="name" required placeholder={copy.newNamePlaceholder} className={input} />
            <div className="flex gap-2">
              <input name="industry" placeholder={copy.newIndustryPlaceholder} className={input} />
              <input name="city" placeholder={copy.newCityPlaceholder} className={input} />
            </div>
            <div className="flex justify-end">
              <PendingButton label={copy.add} className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800" />
            </div>
          </form>
        </details>
      </div>
    </Card>
  );
}
