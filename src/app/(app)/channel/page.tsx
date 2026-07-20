import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { getChannelBackfillProgress, getChannelLastSyncAt } from "@/lib/channel-sync";
import {
  buildChannelWhere,
  getChannelSalesmen,
  getChannelTypeDetails,
  resolveChannelSalesmanFilter,
} from "@/lib/channel-query";
import { InstantSearchInput } from "@/components/instant-search-input";
import { ChannelSyncButton } from "@/components/channel/channel-sync-button";
import { formatMsg } from "@/lib/i18n/messages";

function rankTone(rank?: string | null): "red" | "amber" | "blue" | "zinc" {
  const r = rank?.trim().toUpperCase();
  if (r === "A" || r === "S") return "red";
  if (r === "B") return "amber";
  if (r === "C") return "blue";
  return "zinc";
}

export default async function ChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; salesman?: string }>;
}) {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const l = m.channel;
  const sp = await searchParams;
  const effectiveSalesman = resolveChannelSalesmanFilter(sp.salesman, user.crmSalesmanName);
  const salesmanSelectValue = sp.salesman ?? (effectiveSalesman || "all");

  const [rows, lastSyncAt, salesmen, types, backfill] = await Promise.all([
    db.crmChannel.findMany({
      where: buildChannelWhere(sp, user.crmSalesmanName),
      orderBy: [{ staRecdate: "desc" }, { name: "asc" }],
    }),
    getChannelLastSyncAt(),
    getChannelSalesmen(),
    getChannelTypeDetails(),
    getChannelBackfillProgress(),
  ]);

  const syncedLabel = lastSyncAt
    ? `${l.syncedAt} ${fmtDateTime(lastSyncAt, bcp47)}`
    : l.neverSynced;
  const backfillLabel = backfill.done
    ? l.backfillDone
    : formatMsg(l.backfillProgress, { cursor: backfill.cursor });

  return (
    <div className="pb-16">
      <PageHeader
        title={l.title}
        desc={`${formatMsg(l.desc, { count: rows.length })} · ${syncedLabel} · ${backfillLabel}`}
        actions={<ChannelSyncButton />}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
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
            name="type"
            defaultValue={sp.type ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{l.allTypes}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">
            {m.common.filter}
          </button>
        </form>

        {rows.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={l.empty} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">{l.colCompany}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colType}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colContName}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colRegion}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colRank}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSource}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colSalesman}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colStaSalesOld}</th>
                    <th className="px-4 py-2.5 font-medium">{l.colStaRecdate}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/channel/${row.id}`}
                          className="font-medium text-slate-900 hover:text-sky-700"
                        >
                          {row.name ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.typeDetail ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.contName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {[row.countryCn, row.city].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.rank ? <Badge tone={rankTone(row.rank)}>{row.rank}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.source ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.salesman ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.staSalesOld ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {row.staRecdate ? fmtDate(row.staRecdate, bcp47) : "—"}
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
