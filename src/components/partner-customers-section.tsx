import Link from "next/link";
import { Badge, Card, EmptyState, fmtDate } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { CustomerAiIntakeButton } from "@/components/customer-ai-intake-button";
import { OpportunityProcessBadges } from "@/components/opportunity-process-badges";
import {
  bindCustomerToPartnerAction,
  unbindCustomerFromPartnerAction,
  createSelfCustomerForPartnerAction,
} from "@/lib/customer-actions";
import { filterEndCustomers } from "@/lib/customer-filters";
import { opportunityStatusLabel, opportunityStatusTone } from "@/lib/opportunity-status";
import type { Locale } from "@/lib/i18n/locale";
import type { Messages } from "@/lib/i18n/messages/en";

type CustomerLite = {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  partnerRelation: string | null;
};

type OpportunityLite = {
  id: string;
  name: string;
  status: string;
  stage: string | null;
  nextStep: string | null;
  dealType: string | null;
  amount: string | null;
  followUpAt: Date | null;
  client: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
};

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

function groupOpportunitiesByCustomer(
  opportunities: OpportunityLite[],
  endCustomerIds: Set<string>,
) {
  const byCustomer = new Map<string, OpportunityLite[]>();
  const orphans: OpportunityLite[] = [];

  for (const opp of opportunities) {
    const customerId = opp.customer?.id ?? opp.customerId;
    if (customerId && endCustomerIds.has(customerId)) {
      const list = byCustomer.get(customerId) ?? [];
      list.push(opp);
      byCustomer.set(customerId, list);
    } else {
      orphans.push(opp);
    }
  }

  return { byCustomer, orphans };
}

function OpportunityRow({
  opp,
  m,
  bcp47,
  locale,
  viewDetailLabel,
  indent = true,
}: {
  opp: OpportunityLite;
  m: Messages;
  bcp47: string;
  locale: Locale;
  viewDetailLabel: string;
  indent?: boolean;
}) {
  const customerId = opp.customer?.id;
  const href = customerId ? `/customers/${customerId}` : null;

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800 text-sm">{opp.name}</span>
          <Badge tone={opportunityStatusTone(opp.status)}>
            {opportunityStatusLabel(opp.status, locale)}
          </Badge>
          <OpportunityProcessBadges
            stage={opp.stage ?? ""}
            nextStep={opp.nextStep}
            locale={locale}
            nextPrefix={m.opportunities.nextProcessPrefix}
          />
          {opp.dealType === "PRODUCT" && <Badge tone="amber">{m.common.dealTypeProduct}</Badge>}
          {opp.dealType === "PROJECT" && <Badge tone="indigo">{m.common.dealTypeProject}</Badge>}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {m.common.amount}: {opp.amount ?? "—"}
          {opp.followUpAt && ` · ${m.partnerDetail.followUp}: ${fmtDate(opp.followUpAt, bcp47)}`}
        </div>
      </div>
      {href && (
        <span className="text-xs text-sky-600 shrink-0">{viewDetailLabel}</span>
      )}
    </>
  );

  if (href) {
    return (
      <NavLink
        href={href}
        className={`flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/80 ${
          indent ? "pl-6 pr-3" : "px-3"
        } border-b border-slate-50 last:border-b-0`}
      >
        {content}
      </NavLink>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 py-2.5 ${
        indent ? "pl-6 pr-3" : "px-3"
      } border-b border-slate-50 last:border-b-0`}
    >
      {content}
    </div>
  );
}

const actionBtn =
  "rounded-lg border border-slate-200 bg-white text-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 shrink-0";
const actionBtnPrimary =
  "rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 shrink-0";

export function PartnerCustomersSection({
  partnerId,
  customers,
  unboundCustomers,
  opportunities = [],
  copy,
  statusLabels,
  m,
  bcp47,
  locale,
}: {
  partnerId: string;
  customers: CustomerLite[];
  unboundCustomers: { id: string; name: string }[];
  opportunities?: OpportunityLite[];
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
    noOpportunitiesUnderCustomer: string;
    opportunityCount: string;
    orphanOpportunities: string;
    manageOnCustomer: string;
  };
  statusLabels: Record<string, string>;
  m: Messages;
  bcp47: string;
  locale: Locale;
}) {
  const selectInput =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 min-w-0 max-w-[180px] focus:outline-none focus:ring-2 focus:ring-slate-400";
  const hasSelf = customers.some((cust) => cust.partnerRelation === "SELF");
  const endCustomers = filterEndCustomers(customers);
  const endCustomerIds = new Set(endCustomers.map((c) => c.id));
  const { byCustomer, orphans } = groupOpportunitiesByCustomer(opportunities, endCustomerIds);
  const canBind = unboundCustomers.length > 0;

  return (
    <Card title={copy.title.replace("{count}", String(endCustomers.length))}>
      <p className="text-xs text-slate-400 mb-3">{copy.desc}</p>
      <p className="text-xs text-slate-400 mb-3">{copy.manageOnCustomer}</p>

      <div className="space-y-3">
        {endCustomers.map((cust) => {
          const customerOpps = byCustomer.get(cust.id) ?? [];
          return (
            <div
              key={cust.id}
              className="rounded-lg border border-slate-100 overflow-hidden hover:border-slate-200"
            >
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white">
                <NavLink href={`/customers/${cust.id}`} className="min-w-0 flex-1 hover:opacity-90">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900">{cust.name}</span>
                    <Badge tone={statusTone(cust.status)}>{statusLabels[cust.status] ?? cust.status}</Badge>
                    {customerOpps.length > 0 && (
                      <span className="text-xs text-slate-400">
                        {copy.opportunityCount.replace("{count}", String(customerOpps.length))}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {[cust.industry, [cust.city, cust.country].filter(Boolean).join(" · ")].filter(Boolean).join(" · ") || "—"}
                  </div>
                </NavLink>
                <div className="flex items-center gap-3 shrink-0">
                  <NavLink href={`/customers/${cust.id}`} className="text-xs text-sky-600">
                    {copy.viewDetail}
                  </NavLink>
                  <form action={unbindCustomerFromPartnerAction.bind(null, partnerId, cust.id)} data-no-nav>
                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">{copy.unbind}</button>
                  </form>
                </div>
              </div>

              {customerOpps.length > 0 ? (
                <div className="border-t border-slate-100 bg-slate-50/40">
                  {customerOpps.map((opp) => (
                    <OpportunityRow
                      key={opp.id}
                      opp={opp}
                      m={m}
                      bcp47={bcp47}
                      locale={locale}
                      viewDetailLabel={copy.viewDetail}
                    />
                  ))}
                </div>
              ) : (
                <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-2 text-xs text-slate-400 pl-6">
                  {copy.noOpportunitiesUnderCustomer}
                </div>
              )}
            </div>
          );
        })}

        {orphans.length > 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 overflow-hidden">
            <div className="px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50/60">
              {copy.orphanOpportunities} ({orphans.length})
            </div>
            <div className="bg-white">
              {orphans.map((opp) => (
                <OpportunityRow
                  key={opp.id}
                  opp={opp}
                  m={m}
                  bcp47={bcp47}
                  locale={locale}
                  viewDetailLabel={copy.viewDetail}
                  indent={false}
                />
              ))}
            </div>
          </div>
        )}

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
