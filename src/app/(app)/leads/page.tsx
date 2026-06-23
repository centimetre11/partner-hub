import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { getLeadsLastSyncAt } from "@/lib/leads-sync";

function rankTone(rank?: string | null): "red" | "amber" | "blue" | "zinc" {
  const r = rank?.trim().toUpperCase();
  if (r === "A") return "red";
  if (r === "B") return "amber";
  if (r === "C") return "blue";
  return "zinc";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rank?: string }>;
}) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const l = m.leads;
  const sp = await searchParams;

  const [leads, lastSyncAt] = await Promise.all([
    db.crmLead.findMany({
      where: {
        ...(sp.q
          ? {
              OR: [
                { name: { contains: sp.q } },
                { phone: { contains: sp.q } },
                { salesman: { contains: sp.q } },
              ],
            }
          : {}),
        ...(sp.rank ? { rank: sp.rank } : {}),
      },
      orderBy: { recdate: "desc" },
    }),
    getLeadsLastSyncAt(),
  ]);

  const syncedLabel = lastSyncAt
    ? `${l.syncedAt} ${fmtDateTime(lastSyncAt, bcp47)}`
    : l.neverSynced;

  return (
    <div className="pb-16">
      <PageHeader
        title={l.title}
        desc={`${l.desc.replace("{count}", String(leads.length))} · ${syncedLabel}`}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder={l.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-56"
          />
          <select
            name="rank"
            defaultValue={sp.rank ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{l.allRanks}</option>
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
            <EmptyState text={l.empty} />
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
                        <div className="font-medium text-slate-900">{lead.name ?? "—"}</div>
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
