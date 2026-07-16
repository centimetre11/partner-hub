import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { getLeadsLastSyncAt } from "@/lib/leads-sync";
import {
  buildLeadsSearchParams,
  buildLeadsWhere,
  getLeadSalesmen,
  resolveLeadView,
  resolveSalesmanFilter,
} from "@/lib/leads-query";
import { compareKpiDeadline, isKpiDeadlineUrgent } from "@/lib/leads";
import { InstantSearchInput } from "@/components/instant-search-input";
import { LeadsSyncButton } from "@/components/leads/leads-sync-button";

function rankTone(rank?: string | null): "red" | "amber" | "blue" | "zinc" {
  const r = rank?.trim().toUpperCase();
  if (r === "A" || r === "S") return "red";
  if (r === "B") return "amber";
  if (r === "C") return "blue";
  return "zinc";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rank?: string; salesman?: string; view?: string }>;
}) {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const l = m.leads;
  const sp = await searchParams;
  const view = resolveLeadView(sp.view);
  const effectiveSalesman = resolveSalesmanFilter(sp.salesman, user.crmSalesmanName);
  const salesmanSelectValue = sp.salesman ?? (effectiveSalesman || "all");

  const [rawLeads, lastSyncAt, salesmen] = await Promise.all([
    db.crmLead.findMany({
      where: buildLeadsWhere(sp, user.crmSalesmanName),
    }),
    getLeadsLastSyncAt(),
    getLeadSalesmen(),
  ]);
  const leads =
    view === "nurture"
      ? [...rawLeads].sort((a, b) => (b.recdate?.getTime() ?? 0) - (a.recdate?.getTime() ?? 0))
      : [...rawLeads].sort(compareKpiDeadline);
  const showKpiDeadline = view === "new";

  const syncedLabel = lastSyncAt
    ? `${l.syncedAt} ${fmtDateTime(lastSyncAt, bcp47)}`
    : l.neverSynced;

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active
        ? "border-slate-900 text-slate-900"
        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"
    }`;

  return (
    <div className="pb-16">
      <PageHeader
        title={l.title}
        desc={`${l.desc.replace("{count}", String(leads.length))} · ${syncedLabel}`}
        actions={<LeadsSyncButton />}
      />
      <div className="px-8">
        <div className="flex gap-1 border-b border-slate-200 mb-4">
          <Link
            href={`/leads${buildLeadsSearchParams(sp, { view: "new" })}`}
            className={tabClass(view === "new")}
          >
            {l.tabNew}
          </Link>
          <Link
            href={`/leads${buildLeadsSearchParams(sp, { view: "nurture" })}`}
            className={tabClass(view === "nurture")}
          >
            {l.tabNurture}
          </Link>
        </div>

        <form className="flex flex-wrap gap-2 mb-4" method="get">
          {view === "nurture" && <input type="hidden" name="view" value="nurture" />}
          <InstantSearchInput
            placeholder={l.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-56"
          />
          <select
            name="salesman"
            defaultValue={salesmanSelectValue}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="all">{l.allSalesmen}</option>
            {salesmen.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            name="rank"
            defaultValue={sp.rank ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{l.allRanks}</option>
            <option value="S">S</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">
            {m.common.filter}
          </button>
        </form>

        {leads.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={view === "nurture" ? l.emptyNurture : l.empty} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">{l.colCompany}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colContName}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colRegion}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colRank}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSource}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSalesman}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colKpiStart}</th>
                    {showKpiDeadline && (
                      <th className="px-4 py-2.5 font-medium">{l.colKpiDeadline}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {leads.map((lead) => {
                    const urgent = showKpiDeadline && isKpiDeadlineUrgent(lead.jzDate, new Date(), lead.status);
                    return (
                    <tr key={lead.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-slate-900 hover:text-sky-700"
                        >
                          {lead.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.contName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {[lead.countryCn, lead.city].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {lead.rank ? <Badge tone={rankTone(lead.rank)}>{lead.rank}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.source ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.salesman ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {lead.recdate ? fmtDate(lead.recdate, bcp47) : "—"}
                      </td>
                      {showKpiDeadline && (
                        <td
                          className={`px-4 py-3 whitespace-nowrap ${
                            urgent ? "text-red-600 font-semibold" : "text-slate-500"
                          }`}
                        >
                          {lead.jzDate ? fmtDate(lead.jzDate, bcp47) : "—"}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
