import { NavLink } from "@/components/nav-link";
import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import {
  bindCustomerToPartnerAction,
  unbindCustomerFromPartnerAction,
  createSelfCustomerForPartnerAction,
} from "@/lib/customer-actions";
import { filterEndCustomers } from "@/lib/customer-filters";

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

const actionBtn =
  "rounded-lg border border-slate-200 bg-white text-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 shrink-0";
const actionBtnPrimary =
  "rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 shrink-0";

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
    aiAdd: string;
    unbind: string;
    viewDetail: string;
    selfBadge: string;
    createSelf: string;
    createSelfHint: string;
  };
  statusLabels: Record<string, string>;
}) {
  const selectInput =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 min-w-0 max-w-[180px] focus:outline-none focus:ring-2 focus:ring-slate-400";
  const hasSelf = customers.some((cust) => cust.partnerRelation === "SELF");
  const endCustomers = filterEndCustomers(customers);
  const canBind = unboundCustomers.length > 0;

  return (
    <Card title={copy.title.replace("{count}", String(endCustomers.length))}>
      <p className="text-xs text-slate-400 mb-3">{copy.desc}</p>

      <div className="space-y-2">
        {endCustomers.map((cust) => (
          <div key={cust.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 hover:border-slate-200">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <NavLink href={`/customers/${cust.id}`} className="font-medium text-slate-900 hover:text-sky-700">{cust.name}</NavLink>
                <Badge tone={statusTone(cust.status)}>{statusLabels[cust.status] ?? cust.status}</Badge>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {[cust.industry, [cust.city, cust.country].filter(Boolean).join(" · ")].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <NavLink href={`/customers/${cust.id}`} className="text-xs text-sky-600 hover:underline">{copy.viewDetail}</NavLink>
              <form action={unbindCustomerFromPartnerAction.bind(null, partnerId, cust.id)}>
                <button className="text-xs text-slate-400 hover:text-red-600">{copy.unbind}</button>
              </form>
            </div>
          </div>
        ))}
        {endCustomers.length === 0 && <EmptyState text={copy.empty} />}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
        {canBind ? (
          <form action={bindCustomerToPartnerAction.bind(null, partnerId)} className="flex items-center gap-1.5">
            <select name="customerId" defaultValue="" className={selectInput} required aria-label={copy.bindExisting}>
              <option value="" disabled>{copy.selectCustomer}</option>
              {unboundCustomers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button type="submit" className={actionBtn}>{copy.bind}</button>
          </form>
        ) : (
          <span className="text-xs text-slate-400">{copy.noUnbound}</span>
        )}

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {!hasSelf && (
            <form action={createSelfCustomerForPartnerAction.bind(null, partnerId)}>
              <button
                type="submit"
                title={copy.createSelfHint}
                className={`${actionBtn} border-indigo-200 text-indigo-700 hover:bg-indigo-50`}
              >
                {copy.createSelf}
              </button>
            </form>
          )}
          <CustomerAiIntakeButton
            partnerId={partnerId}
            label={copy.aiAdd}
            variant="section"
            onDoneNavigate="refresh"
          />
          <Link href={`/customers?partner=${partnerId}&add=1`} className={actionBtnPrimary}>
            {copy.addNew}
          </Link>
        </div>
      </div>
    </Card>
  );
}
