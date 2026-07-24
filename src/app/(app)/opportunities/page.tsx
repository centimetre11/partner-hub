import { NavLink } from "@/components/nav-link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { AddOpportunityForm } from "./add-opportunity-form";
import { OpportunityProcessBadges } from "@/components/opportunity-process-badges";
import {
  PROCESS_TAG_CODES,
  formatNextProcessDisplay,
  isProcessTagCode,
  processTagLabel,
} from "@/lib/opportunity-process-tags";
import {
  OPEN_OPPORTUNITY_STATUSES,
  OPPORTUNITY_STATUS_CODES,
  opportunityStatusLabel,
  opportunityStatusTone,
} from "@/lib/opportunity-status";
import { InstantSearchInput } from "@/components/instant-search-input";
import { SearchableSelect } from "@/components/searchable-select";
import { ListPagination } from "@/components/list-pagination";
import { nameContainsWhere } from "@/lib/name-search";
import { parseListPage } from "@/lib/list-pagination";
import { formatAmountDisplay } from "@/lib/amount";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    customer?: string;
    partner?: string;
    dealType?: string;
    process?: string;
    page?: string;
  }>;
}) {
  await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const o = m.opportunities;
  const c = m.customers;
  const sp = await searchParams;
  const { page, take, skip } = parseListPage(sp.page);
  // 首次进入默认「推进中」（P20/P50/P80）；选「全部状态」时 status="" 不按状态过滤
  const statusFilter = sp.status === undefined ? "open" : sp.status;
  const processFilter =
    sp.process && isProcessTagCode(sp.process.toUpperCase())
      ? (sp.process.toUpperCase() as (typeof PROCESS_TAG_CODES)[number])
      : "";
  const nameFilter = nameContainsWhere(sp.q);

  const statusWhere =
    statusFilter === "open"
      ? { status: { in: [...OPEN_OPPORTUNITY_STATUSES] } }
      : statusFilter === "ACTIVE"
        ? { status: { in: ["ACTIVE", "P20"] } }
        : statusFilter
          ? { status: statusFilter }
          : {};

  const where = {
    ...(nameFilter ? { name: nameFilter } : {}),
    ...statusWhere,
    ...(sp.customer ? { customerId: sp.customer } : {}),
    ...(sp.partner ? { partnerId: sp.partner } : {}),
    ...(sp.dealType ? { dealType: sp.dealType } : {}),
    ...(processFilter ? { stage: { contains: processFilter } } : {}),
  };

  const [opportunities, total, customers, partners] = await Promise.all([
    db.opportunity.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
        project: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    db.opportunity.count({ where }),
    db.customer.findMany({
      select: { id: true, name: true, crmCustomerId: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const pageLabels = {
    prevPage: m.common.prevPage,
    nextPage: m.common.nextPage,
    pageOf: m.common.pageOf,
  };
  const filterParams = {
    q: sp.q,
    status: sp.status,
    process: sp.process,
    customer: sp.customer,
    partner: sp.partner,
    dealType: sp.dealType,
  };

  const dealTypeLabel = (dt: string | null) =>
    dt === "PROJECT" ? c.dealTypeProject : dt === "PRODUCT" ? c.dealTypeProduct : "—";

  return (
    <div className="pb-16">
      <PageHeader
        title={o.title}
        desc={o.desc.replace("{count}", String(total))}
        actions={<AddOpportunityForm customers={customers} partners={partners} />}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <InstantSearchInput
            placeholder={o.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-48"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{o.allStatuses}</option>
            <option value="open">{o.statusOpen}</option>
            {OPPORTUNITY_STATUS_CODES.map((code) => (
              <option key={code} value={code}>
                {opportunityStatusLabel(code, locale)}
              </option>
            ))}
          </select>
          <select
            name="process"
            defaultValue={processFilter}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{o.allProcesses}</option>
            {PROCESS_TAG_CODES.map((code) => (
              <option key={code} value={code}>
                {processTagLabel(code, locale)}
              </option>
            ))}
          </select>
          <SearchableSelect
            name="customer"
            defaultValue={sp.customer ?? ""}
            emptyLabel={o.allCustomers}
            fullWidth={false}
            className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            aria-label={o.allCustomers}
            options={customers.map((cust) => ({ value: cust.id, label: cust.name }))}
          />
          <SearchableSelect
            name="partner"
            defaultValue={sp.partner ?? ""}
            emptyLabel={o.allPartners}
            fullWidth={false}
            className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            aria-label={o.allPartners}
            options={partners.map((p) => ({ value: p.id, label: p.name }))}
          />
          <select
            name="dealType"
            defaultValue={sp.dealType ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{o.allDealTypes}</option>
            <option value="PROJECT">{c.dealTypeProject}</option>
            <option value="PRODUCT">{c.dealTypeProduct}</option>
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">
            {m.common.filter}
          </button>
        </form>

        {opportunities.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={o.empty} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">{o.colName}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colCustomer}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colPartner}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colStage}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colNextProcess}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colAmount}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colStatus}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colDealType}</th>
                    <th className="px-4 py-2.5 font-medium">{o.colFollowUp}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {opportunities.map((opp) => (
                    <tr key={opp.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        {opp.customerId ? (
                          <NavLink
                            href={`/customers/${opp.customerId}?tab=opportunities`}
                            className="font-medium text-slate-900 hover:text-sky-700"
                          >
                            {opp.name}
                          </NavLink>
                        ) : (
                          <span className="font-medium text-slate-400">{opp.name}</span>
                        )}
                        {opp.project && (
                          <div className="text-[11px] text-indigo-500 mt-0.5">{c.projectConverted}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {opp.customer ? (
                          <NavLink
                            href={`/customers/${opp.customer.id}?tab=opportunities`}
                            className="text-sky-600 hover:underline"
                          >
                            {opp.customer.name}
                          </NavLink>
                        ) : (
                          <span className="text-slate-300">{o.noCustomer}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {opp.partner ? (
                          <NavLink href={`/partners/${opp.partner.id}`} className="text-sky-600 hover:underline">
                            {opp.partner.name}
                          </NavLink>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <OpportunityProcessBadges stage={opp.stage} locale={locale} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatNextProcessDisplay(opp.nextStep, locale) || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">
                        {formatAmountDisplay(opp.amount, opp.currency, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={opportunityStatusTone(opp.status)}>
                          {opportunityStatusLabel(opp.status, locale)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{dealTypeLabel(opp.dealType)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {opp.followUpAt ? fmtDate(opp.followUpAt, bcp47) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              pathname="/opportunities"
              searchParams={filterParams}
              page={page}
              total={total}
              pageSize={take}
              labels={pageLabels}
            />
          </div>
        )}
      </div>
    </div>
  );
}
