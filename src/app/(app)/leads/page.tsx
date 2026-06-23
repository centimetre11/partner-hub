import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { getLeadsLastSyncAt } from "@/lib/leads-sync";
import {
  buildLeadsSearchParams,
  buildLeadsWhere,
  getLeadSalesmen,
  resolveLeadView,
  resolveSalesmanFilter,
} from "@/lib/leads-query";

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

  const [leads, lastSyncAt, salesmen] = await Promise.all([
    db.crmLead.findMany({
      where: buildLeadsWhere(sp, user.crmSalesmanName),
      orderBy: { recdate: "desc" },
    }),
    getLeadsLastSyncAt(),
    getLeadSalesmen(),
  ]);

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

        <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 mb-4">
          {l.viewHint}
        </p>

        <form className="flex flex-wrap gap-2 mb-4" method="get">
          {view === "nurture" && <input type="hidden" name="view" value="nurture" />}
          <input
            name="q"
            defaultValue={sp.q}
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
                    <th className="px-4 py-2.5 font-medium">{l.colName}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colRegion}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colProvince}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colRank}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colStatus}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSource}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSalesman}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSdr}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colCreatedAt}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium text-slate-900 hover:text-sky-700"
                        >
                          {lead.name ?? "—"}
                        </Link>
                        {lead.phone && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{lead.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {[lead.countryCn, lead.city].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.province ?? "—"}</td>
                      <td className="px-4 py-3">
                        {lead.rank ? <Badge tone={rankTone(lead.rank)}>{lead.rank}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.status ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.source ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.salesman ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.sdrState ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {fmtDateTime(lead.recdate, bcp47)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
