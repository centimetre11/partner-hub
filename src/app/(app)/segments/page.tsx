import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader, Card, Badge, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { loadSegmentInsightSummary } from "@/lib/customer-segment";
import { loadTaxonomyLabelMaps, labelFromMap } from "@/lib/taxonomy";
import { db } from "@/lib/db";
import { findMeaStrategyBaselineReport } from "@/lib/mea-strategy-report";

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-40 text-slate-600 text-xs shrink-0 truncate" title={label}>
        {label}
      </div>
      <div className="flex-1 h-5 bg-slate-50 rounded-md overflow-hidden">
        <div
          className="h-full bg-sky-500 rounded-md"
          style={{ width: max ? `${(value / max) * 100}%` : 0 }}
        />
      </div>
      <div className="w-10 text-right text-xs tabular-nums text-slate-500 shrink-0">{value}</div>
    </div>
  );
}

export default async function SegmentsPage() {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const s = m.segments;
  const [summary, labelMaps, baselineReport] = await Promise.all([
    loadSegmentInsightSummary(),
    loadTaxonomyLabelMaps(),
    findMeaStrategyBaselineReport(db),
  ]);

  const maxSeg = Math.max(...summary.segments.map((x) => x.prospects + x.active + x.openOpps + x.won), 1);

  return (
    <div className="pb-16">
      <PageHeader title={s.title} desc={s.desc} />

      <div className="px-8 space-y-5">
        {baselineReport && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-indigo-900">
              <span className="font-medium">{s.baselineReportLabel}</span>
              <span className="text-indigo-700/80 ml-2">
                {s.baselineReportUpdated.replace("{date}", fmtDateTime(baselineReport.updatedAt, bcp47))}
              </span>
            </div>
            <Link
              href={`/documents/${baselineReport.id}`}
              className="text-sm text-indigo-700 font-medium hover:underline shrink-0"
            >
              {s.openBaselineReport} →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label={s.statTotalCustomers} value={summary.totalEndCustomers} />
          <Stat label={s.statTaggedRate} value={`${summary.taggedRate}%`} tone="text-sky-600" />
          <Stat label={s.statTierA} value={summary.tierACount} tone="text-emerald-600" />
          <Stat
            label={s.statOpenOpps}
            value={summary.segments.reduce((n, x) => n + x.openOpps, 0)}
            tone="text-amber-600"
          />
        </div>

        <Card title={s.segmentMatrixTitle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">{s.colSegment}</th>
                  <th className="py-2 px-2 font-medium">{s.colProspect}</th>
                  <th className="py-2 px-2 font-medium">{s.colActive}</th>
                  <th className="py-2 px-2 font-medium">{s.colOpenOpp}</th>
                  <th className="py-2 px-2 font-medium">{s.colWon}</th>
                  <th className="py-2 px-2 font-medium">{s.colLost}</th>
                  <th className="py-2 pl-2 font-medium">{s.colPartnerCoverage}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {summary.segments.map((row) => (
                  <tr key={row.code} className="hover:bg-slate-50/50">
                    <td className="py-2.5 pr-3">
                      {row.code === "_UNTAGGED" ? (
                        <span className="text-slate-500">{s.untagged}</span>
                      ) : (
                        <Link
                          href={`/customers?segment=${row.code}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {labelFromMap(labelMaps.CUSTOMER_SEGMENT, row.code, row.label)}
                        </Link>
                      )}
                    </td>
                    <td className="py-2.5 px-2 tabular-nums text-slate-600">{row.prospects}</td>
                    <td className="py-2.5 px-2 tabular-nums text-slate-600">{row.active}</td>
                    <td className="py-2.5 px-2 tabular-nums text-amber-700">{row.openOpps}</td>
                    <td className="py-2.5 px-2 tabular-nums text-emerald-700">{row.won}</td>
                    <td className="py-2.5 px-2 tabular-nums text-red-600">{row.lost}</td>
                    <td className="py-2.5 pl-2 tabular-nums text-slate-600">{row.partnerCoverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">{s.segmentMatrixHint}</p>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card title={s.customerTierTitle}>
            <div className="flex flex-wrap gap-3">
              {summary.tiers.map((t) => (
                <Link
                  key={t.code}
                  href={`/customers?tier=${t.code}`}
                  className="flex-1 min-w-[100px] rounded-lg border border-slate-100 p-3 text-center hover:border-slate-300"
                >
                  <Badge tone={t.code === "A" ? "green" : t.code === "B" ? "amber" : "blue"}>
                    {t.label}
                  </Badge>
                  <div className="text-xl font-bold mt-1.5 tabular-nums">{t.count}</div>
                </Link>
              ))}
            </div>
          </Card>

          <Card title={s.segmentDistTitle}>
            <div className="space-y-2">
              {summary.segments
                .filter((x) => x.code !== "_UNTAGGED")
                .slice(0, 8)
                .map((row) => (
                  <Bar
                    key={row.code}
                    label={labelFromMap(labelMaps.CUSTOMER_SEGMENT, row.code, row.label)}
                    value={row.prospects + row.active}
                    max={maxSeg}
                  />
                ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card title={s.winFactorsTitle}>
            {summary.winFactors.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">{s.noWinLossData}</p>
            ) : (
              <div className="space-y-2">
                {summary.winFactors.map((w) => (
                  <Bar
                    key={w.code}
                    label={labelFromMap(labelMaps.WIN_FACTOR, w.code, w.label)}
                    value={w.count}
                    max={summary.winFactors[0]?.count ?? 1}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title={s.lossReasonsTitle}>
            {summary.lossReasons.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">{s.noWinLossData}</p>
            ) : (
              <div className="space-y-2">
                {summary.lossReasons.map((l) => (
                  <Bar
                    key={l.code}
                    label={labelFromMap(labelMaps.LOSS_REASON, l.code, l.label)}
                    value={l.count}
                    max={summary.lossReasons[0]?.count ?? 1}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
